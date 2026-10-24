/* FunnyMela Backend (Node 18+)
   Razorpay Payment Gateway + Supabase Database + Admin Analytics
   Prices and rules live strictly on the server (CATALOG).
*/
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const E = process.env;
const app = express();

app.set("trust proxy", 1);

// Flexible and secure CORS configuration
const allowedOrigins = (E.SITE_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, same-origin, file://)
      if (!origin || origin === "null") return callback(null, true);
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation"), false);
    },
    credentials: true
  })
);

// Timing-safe comparison to prevent timing attack vulnerabilities
const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// Razorpay Client
let rz = null;
if (E.RZP_KEY_ID && E.RZP_KEY_SECRET) {
  rz = new Razorpay({ key_id: E.RZP_KEY_ID, key_secret: E.RZP_KEY_SECRET });
}

// Supabase Client
let db = null;
const sbKey = E.SUPABASE_SERVICE_KEY || E.SUPABASE_KEY || E.SUPABASE_ANON_KEY;
if (E.SUPABASE_URL && sbKey) {
  db = createClient(E.SUPABASE_URL, sbKey);
}

// Webhook endpoint requires raw body buffer for HMAC verification. Must be defined before express.json()
app.post("/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const sig = req.get("x-razorpay-signature") || "";
    if (!E.RZP_WEBHOOK_SECRET) {
      console.error("[Webhook Error] RZP_WEBHOOK_SECRET not configured");
      return res.sendStatus(500);
    }
    const exp = crypto
      .createHmac("sha256", E.RZP_WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    if (!same(exp, sig)) {
      console.warn("[Webhook] Invalid signature received");
      return res.sendStatus(400);
    }

    const rawStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
    const ev = typeof rawStr === "string" ? JSON.parse(rawStr) : rawStr;

    if (ev && ev.event === "payment.captured") {
      const orderId = ev.payload?.payment?.entity?.order_id;
      if (orderId) {
        await settle(orderId);
      }
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("[Webhook Error]", err);
    return res.sendStatus(400);
  }
});

// JSON body parser for normal endpoints
app.use(express.json({ limit: "15kb" }));

/* PRICES LIVE ONLY HERE - the browser can NEVER choose a price */
const CATALOG = {
  skin_raja: { p: 49 },
  skin_hero: { p: 49 },
  skin_cop: { p: 39 },
  bike_gold: { p: 59 },
  bike_fire: { p: 79 },
  gf_lehnga: { p: 39 },
  shield: { p: 29, q: 3 },
  slow: { p: 19, q: 5 },
  coins1: { p: 49 },
  coins2: { p: 99 },
  fw: { p: 39 },
  noads: { p: 99 },
  vip: { p: 149 },
  starter: { p: 49 }
};

// Retrieve entitlements for a given user ID
const entOf = async uid => {
  if (!db || !uid) return {};
  try {
    const { data, error } = await db.from("ent").select("item,qty").eq("uid", uid);
    if (error) {
      console.error("[Entitlements Error]", error);
      return {};
    }
    return Object.fromEntries((data || []).map(r => [r.item, r.qty]));
  } catch (err) {
    console.error("[Entitlements Fetch Error]", err);
    return {};
  }
};

// Settle order idempotently: only flips created -> paid once
async function settle(orderId) {
  if (!db || !orderId) return null;
  try {
    const { data: o, error } = await db
      .from("orders")
      .update({ status: "paid" })
      .eq("order_id", orderId)
      .eq("status", "created")
      .select()
      .maybeSingle();

    if (error) {
      console.error("[Settle Error]", error);
    }

    if (!o) {
      // Order was either already settled or not found
      const { data: existing } = await db.from("orders").select().eq("order_id", orderId).maybeSingle();
      return existing || null;
    }

    if (o.item === "donation") {
      await db.from("donations").insert({
        name: o.name || "Anonymous",
        amount: o.amount,
        uid: o.uid
      });
      return o;
    }

    const itemMeta = CATALOG[o.item] || {};
    const grantQty = itemMeta.q || 1;

    const { data: e } = await db.from("ent").select("qty").eq("uid", o.uid).eq("item", o.item).maybeSingle();
    await db.from("ent").upsert({
      uid: o.uid,
      item: o.item,
      qty: (e?.qty || 0) + grantQty
    });

    if (o.item === "starter") {
      for (const [i, n] of [["shield", 3], ["slow", 5]]) {
        const { data: x } = await db.from("ent").select("qty").eq("uid", o.uid).eq("item", i).maybeSingle();
        await db.from("ent").upsert({
          uid: o.uid,
          item: i,
          qty: (x?.qty || 0) + n
        });
      }
    }
    return o;
  } catch (err) {
    console.error("[Settle Execution Error]", err);
    return null;
  }
}

// 1. Create Store Order
app.post("/order", async (req, res) => {
  try {
    const { uid, item } = req.body || {};
    const c = CATALOG[item];
    if (!c || !/^[\w-]{6,40}$/.test(uid || "")) {
      return res.status(400).json({ error: "bad request" });
    }
    if (!rz) {
      return res.status(500).json({ error: "Payment gateway not configured" });
    }
    if (!db) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const receipt = (uid + "_" + Date.now()).slice(0, 40);
    const o = await rz.orders.create({
      amount: c.p * 100, // paise
      currency: "INR",
      receipt,
      notes: { uid, item }
    });

    const { error: insErr } = await db.from("orders").insert({
      order_id: o.id,
      uid,
      item,
      amount: c.p,
      status: "created"
    });

    if (insErr) {
      console.error("[Create Order DB Error]", insErr);
      return res.status(500).json({ error: "Could not save order in database" });
    }

    res.json({ order_id: o.id, amount: o.amount, key: E.RZP_KEY_ID });
  } catch (err) {
    console.error("[Create Order Error]", err);
    res.status(500).json({ error: "Could not create order" });
  }
});

// 2. Create Donation Order
app.post("/donate/order", async (req, res) => {
  try {
    const { uid } = req.body || {};
    const amount = Math.floor(+req.body.amount);
    const name = String(req.body.name || "")
      .replace(/[<>&"'`]/g, "")
      .trim()
      .slice(0, 16) || "Anonymous";

    if (!/^[\w-]{6,40}$/.test(uid || "") || !(amount >= 10 && amount <= 10000)) {
      return res.status(400).json({ error: "bad request" });
    }
    if (!rz) {
      return res.status(500).json({ error: "Payment gateway not configured" });
    }
    if (!db) {
      return res.status(500).json({ error: "Database not configured" });
    }

    const receipt = (uid + "_d_" + Date.now()).slice(0, 40);
    const o = await rz.orders.create({
      amount: amount * 100, // paise
      currency: "INR",
      receipt,
      notes: { uid, name }
    });

    const { error: insErr } = await db.from("orders").insert({
      order_id: o.id,
      uid,
      item: "donation",
      name,
      amount,
      status: "created"
    });

    if (insErr) {
      console.error("[Donate Order DB Error]", insErr);
      return res.status(500).json({ error: "Could not save donation order in database" });
    }

    res.json({ order_id: o.id, amount: o.amount, key: E.RZP_KEY_ID });
  } catch (err) {
    console.error("[Donate Order Error]", err);
    res.status(500).json({ error: "Could not create donation order" });
  }
});

// 3. Verify Payment
app.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id: oid,
      razorpay_payment_id: pid,
      razorpay_signature: sig
    } = req.body || {};

    if (!oid || !pid || !sig) {
      return res.status(400).json({ ok: false, error: "Missing verification parameters" });
    }
    if (!E.RZP_KEY_SECRET) {
      return res.status(500).json({ ok: false, error: "Secret key not configured" });
    }

    const exp = crypto
      .createHmac("sha256", E.RZP_KEY_SECRET)
      .update(oid + "|" + pid)
      .digest("hex");

    if (!same(exp, sig)) {
      return res.status(400).json({ ok: false, error: "Invalid payment signature" });
    }

    if (!db) {
      return res.status(500).json({ ok: false, error: "Database not configured" });
    }

    const { data: o, error } = await db.from("orders").select("uid").eq("order_id", oid).maybeSingle();
    if (error || !o) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    await settle(oid);
    const ent = await entOf(o.uid);
    res.json({ ok: true, ent });
  } catch (err) {
    console.error("[Verify Error]", err);
    res.status(500).json({ ok: false, error: "Payment verification failed" });
  }
});

// 4. Get Entitlements
app.get("/entitlements", async (req, res) => {
  const uid = String(req.query.uid || "");
  const ent = await entOf(uid);
  res.json({ ent });
});

// 5. Use Consumable Item (Shield / Slow)
app.post("/use", async (req, res) => {
  try {
    const { uid, item } = req.body || {};
    if (!["shield", "slow"].includes(item) || !/^[\w-]{6,40}$/.test(uid || "")) {
      return res.sendStatus(400);
    }
    const e = await entOf(uid);
    if ((e[item] || 0) > 0 && db) {
      await db.from("ent").update({ qty: e[item] - 1 }).eq("uid", uid).eq("item", item);
    }
    res.json({ ent: await entOf(uid) });
  } catch (err) {
    console.error("[Use Item Error]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// 6. Get Donations for the Pole
let dCache = { t: 0, v: null };
app.get("/donations", async (_q, res) => {
  try {
    if (Date.now() - dCache.t < 10000 && dCache.v) {
      return res.json(dCache.v);
    }
    if (!db) {
      return res.json(dCache.v || { top: [], total: 0, recent: [] });
    }

    const { data, error } = await db
      .from("donations")
      .select("id,name,amount,ts")
      .order("id", { ascending: false })
      .limit(5000);

    if (error) {
      console.error("[Donations Error]", error);
      if (dCache.v) return res.json(dCache.v);
    }

    const m = {};
    let total = 0;
    (data || []).forEach(d => {
      m[d.name] = (m[d.name] || 0) + d.amount;
      total += d.amount;
    });

    dCache = {
      t: Date.now(),
      v: {
        top: Object.entries(m)
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10),
        total,
        recent: (data || []).slice(0, 20)
      }
    };
    res.json(dCache.v);
  } catch (err) {
    console.error("[Donations Fetch Error]", err);
    res.json({ top: [], total: 0, recent: [] });
  }
});

// 7. Game Analytics / Events (Rate limited)
const hits = new Map();
setInterval(() => hits.clear(), 60000);

app.post("/event", async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    if (n > 60) return res.sendStatus(429);

    const b = req.body || {};
    const s = (v, l) => (v == null ? null : String(v).slice(0, l));

    if (db) {
      await db.from("events").insert({
        ev: s(b.ev, 20),
        sid: s(b.sid, 20),
        name: s(b.name, 20),
        item: s(b.item, 300),
        shop: s(b.shop, 40),
        price: +b.price || null,
        type: s(b.type, 20),
        gender: s(b.gender, 10),
        ts: Date.now()
      });
    }
    res.sendStatus(204);
  } catch (err) {
    console.error("[Event Logging Error]", err);
    res.sendStatus(204); // Analytics errors do not block game experience
  }
});

// Admin authentication helpers
const sign = p => p + "." + crypto.createHmac("sha256", E.ADMIN_TOKEN_SECRET || "default_secret").update(p).digest("hex");

const auth = (req, res, next) => {
  try {
    const rawHeader = req.get("authorization") || "";
    const t = rawHeader.replace(/^Bearer\s+/i, "");
    if (!t || !t.includes(".")) return res.sendStatus(401);

    const [p, s] = t.split(".");
    if (!p || !s || !same(sign(p), t)) return res.sendStatus(401);

    const payload = JSON.parse(Buffer.from(p, "base64").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return res.sendStatus(401);

    req.admin = payload;
    next();
  } catch (err) {
    return res.sendStatus(401);
  }
};

// 8. Admin Login (ID + password -> 12h signed token)
app.post("/admin/login", (req, res) => {
  try {
    const { id, password } = req.body || {};
    const adminId = (E.ADMIN_ID || "demotionguy@gmail.com").trim().toLowerCase();
    const adminPass = (E.ADMIN_PASS || "vishal@07860").trim();
    const adminSalt = (E.ADMIN_PASS_SALT || "4a8e2f9d1c7b3e5a").trim();

    if (!id || !password) {
      return res.status(401).json({ ok: false, error: "Please provide ID and password" });
    }

    const inputId = String(id).trim().toLowerCase();
    const inputPass = String(password).trim();

    let passMatches = false;
    // Direct match against ADMIN_PASS
    if (adminPass && inputPass === adminPass) {
      passMatches = true;
    }
    // Hash match with scrypt
    if (!passMatches && adminSalt) {
      try {
        const h = crypto.scryptSync(inputPass, adminSalt, 32).toString("hex");
        if (E.ADMIN_PASS_HASH && same(h, E.ADMIN_PASS_HASH)) {
          passMatches = true;
        }
      } catch (e) {}
    }

    if (inputId !== adminId || !passMatches) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const payload = Buffer.from(
      JSON.stringify({
        id: adminId,
        exp: Date.now() + 12 * 3600e3
      })
    ).toString("base64");

    res.json({ ok: true, token: sign(payload) });
  } catch (err) {
    console.error("[Admin Login Error]", err);
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

// 9. Admin Events & Paid Orders
app.get("/admin/events", auth, async (_q, res) => {
  try {
    if (!db) {
      return res.json({ events: [], paid: [] });
    }
    const { data: events } = await db.from("events").select("*").order("ts", { ascending: false }).limit(5000);
    const { data: paid } = await db.from("orders").select("item,amount,status,name,created_at").eq("status", "paid");
    res.json({ events: events || [], paid: paid || [] });
  } catch (err) {
    console.error("[Admin Events Error]", err);
    res.status(500).json({ error: "Failed to fetch admin events" });
  }
});

// 10. Health check endpoint (checks service status & live Supabase connectivity)
app.get("/health", async (_q, res) => {
  let dbConnected = false;
  if (db) {
    try {
      const { error } = await db.from("orders").select("order_id").limit(1);
      dbConnected = !error;
    } catch {
      dbConnected = false;
    }
  }

  res.json({
    ok: true,
    name: "funnymela",
    timestamp: Date.now(),
    razorpayConfigured: !!(E.RZP_KEY_ID && E.RZP_KEY_SECRET),
    supabaseConfigured: !!(E.SUPABASE_URL && sbKey),
    supabaseConnected: dbConnected
  });
});

// Serve frontend game and admin panel directly from backend
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/admin", express.static(path.join(__dirname, "../admin")));

// Export app and internals for automated testing
module.exports = {
  app,
  CATALOG,
  settle,
  same,
  entOf,
  sign,
  auth
};

// Start server if executed directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n=======================================================`);
    console.log(`🎡 FunnyMela Server is running!`);
    console.log(`👉 Game Link:   http://localhost:${PORT}`);
    console.log(`👉 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`=======================================================`);
    console.log(`Razorpay configured: ${!!(E.RZP_KEY_ID && E.RZP_KEY_SECRET)}`);
    console.log(`Supabase configured: ${!!(E.SUPABASE_URL && sbKey)}\n`);
  });
}
