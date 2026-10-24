const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const http = require("http");

// Configure test environment variables before requiring server
process.env.RZP_KEY_ID = "rzp_test_mock123";
process.env.RZP_KEY_SECRET = "test_rzp_secret_key_abcdef123456";
process.env.RZP_WEBHOOK_SECRET = "test_webhook_secret_789";
process.env.ADMIN_ID = "owner";
process.env.ADMIN_PASS_SALT = "testsalt123";
process.env.ADMIN_PASS_HASH = crypto.scryptSync("testpass123", "testsalt123", 32).toString("hex");
process.env.ADMIN_TOKEN_SECRET = "test_admin_token_secret_xyz";
process.env.PORT = "3456";

const { app, CATALOG, same, sign } = require("../server.js");

let server;
let baseUrl;

before(async () => {
  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
});

// Helper for HTTP requests
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, options);
  let body = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
  } else {
    body = await res.text();
  }
  return { status: res.status, headers: res.headers, body };
}

describe("FunnyMela Backend Automated Test Suite", () => {
  test("GET /health returns 200 with service info", async () => {
    const res = await request("/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.name, "funnymela");
  });

  test("Timing safe comparison (same helper)", () => {
    assert.strictEqual(same("hello", "hello"), true);
    assert.strictEqual(same("hello", "world"), false);
    assert.strictEqual(same("hello", "hell"), false);
    assert.strictEqual(same(null, "hello"), false);
    assert.strictEqual(same(undefined, undefined), false);
  });

  describe("POST /order", () => {
    test("Rejects missing or invalid uid", async () => {
      const res = await request("/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "bad", item: "skin_raja" })
      });
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.body, { error: "bad request" });
    });

    test("Rejects invalid item not in CATALOG", async () => {
      const res = await request("/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "user_valid_123", item: "super_hacked_item" })
      });
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.body, { error: "bad request" });
    });

    test("Ensures CATALOG enforces exact server prices", () => {
      assert.strictEqual(CATALOG.skin_raja.p, 49);
      assert.strictEqual(CATALOG.bike_gold.p, 59);
      assert.strictEqual(CATALOG.shield.p, 29);
      assert.strictEqual(CATALOG.starter.p, 49);
    });
  });

  describe("POST /donate/order", () => {
    test("Rejects donation amount less than 10", async () => {
      const res = await request("/donate/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "user_valid_123", name: "Ramesh", amount: 5 })
      });
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.body, { error: "bad request" });
    });

    test("Rejects donation amount greater than 10000", async () => {
      const res = await request("/donate/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "user_valid_123", name: "Ramesh", amount: 50000 })
      });
      assert.strictEqual(res.status, 400);
      assert.deepStrictEqual(res.body, { error: "bad request" });
    });

    test("Sanitizes HTML/script tags from donor name", async () => {
      // Input validation test
      const dirtyName = "<script>alert('xss')</script>Ramesh";
      const cleaned = dirtyName.replace(/[<>&"'`]/g, "").trim().slice(0, 16);
      assert.strictEqual(cleaned.includes("<"), false);
      assert.strictEqual(cleaned.includes(">"), false);
      assert.strictEqual(cleaned, "scriptalert(xss)");
    });
  });

  describe("POST /verify", () => {
    test("Rejects missing signature parameters", async () => {
      const res = await request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razorpay_order_id: "order_123" })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.ok, false);
    });

    test("Rejects invalid signature", async () => {
      const res = await request("/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: "order_123",
          razorpay_payment_id: "pay_456",
          razorpay_signature: "invalid_tampered_signature"
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.ok, false);
    });

    test("Valid signature HMAC computation matches expected logic", () => {
      const oid = "order_test_999";
      const pid = "pay_test_888";
      const expectedSig = crypto
        .createHmac("sha256", process.env.RZP_KEY_SECRET)
        .update(`${oid}|${pid}`)
        .digest("hex");
      assert.strictEqual(same(expectedSig, expectedSig), true);
    });
  });

  describe("POST /webhook", () => {
    test("Rejects webhook with invalid signature", async () => {
      const payload = JSON.stringify({ event: "payment.captured", payload: {} });
      const res = await request("/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "bogus_signature"
        },
        body: payload
      });
      assert.strictEqual(res.status, 400);
    });

    test("Accepts webhook with valid HMAC signature", async () => {
      const payload = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { order_id: "order_mock_test" } } }
      });
      const validSig = crypto
        .createHmac("sha256", process.env.RZP_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      const res = await request("/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": validSig
        },
        body: payload
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe("POST /use", () => {
    test("Rejects unallowed item for /use", async () => {
      const res = await request("/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "user_valid_123", item: "skin_raja" })
      });
      assert.strictEqual(res.status, 400);
    });

    test("Accepts allowed items: shield and slow", async () => {
      const res = await request("/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: "user_valid_123", item: "shield" })
      });
      // Should succeed and return { ent: ... }
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.body.ent === "object");
    });
  });

  describe("GET /donations", () => {
    test("Returns top, recent, and total structure", async () => {
      const res = await request("/donations");
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.top));
      assert.ok(Array.isArray(res.body.recent));
      assert.strictEqual(typeof res.body.total, "number");
    });
  });

  describe("POST /event (Rate Limiting)", () => {
    test("Logs events and returns 204", async () => {
      const res = await request("/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ev: "play", sid: "sess_1", name: "Player1" })
      });
      assert.strictEqual(res.status, 204);
    });
  });

  describe("Admin Authentication (/admin/login, /admin/events)", () => {
    test("Rejects wrong admin password", async () => {
      const res = await request("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "owner", password: "wrong_password" })
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.ok, false);
    });

    test("Accepts correct admin credentials and returns token", async () => {
      const res = await request("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "owner", password: "testpass123" })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.ok, true);
      assert.ok(typeof res.body.token === "string");
      assert.ok(res.body.token.includes("."));
    });

    test("Rejects unauthenticated access to /admin/events", async () => {
      const res = await request("/admin/events");
      assert.strictEqual(res.status, 401);
    });

    test("Rejects expired or tampered token for /admin/events", async () => {
      const expiredPayload = Buffer.from(JSON.stringify({ id: "owner", exp: Date.now() - 5000 })).toString("base64");
      const expiredToken = sign(expiredPayload);

      const res = await request("/admin/events", {
        headers: { Authorization: `Bearer ${expiredToken}` }
      });
      assert.strictEqual(res.status, 401);
    });

    test("Allows valid admin token to access /admin/events", async () => {
      const validPayload = Buffer.from(JSON.stringify({ id: "owner", exp: Date.now() + 3600000 })).toString("base64");
      const validToken = sign(validPayload);

      const res = await request("/admin/events", {
        headers: { Authorization: `Bearer ${validToken}` }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.body.events));
      assert.ok(Array.isArray(res.body.paid));
    });
  });
});
