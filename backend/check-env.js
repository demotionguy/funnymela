#!/usr/bin/env node
/**
 * FunnyMela Environment & Credentials Checker
 * Run: node check-env.js
 * Or generate admin password hash: node check-env.js --password "YourSecretPassword"
 */
require("dotenv").config();
const crypto = require("crypto");

const args = process.argv.slice(2);
const passIdx = args.indexOf("--password");
if (passIdx !== -1 && args[passIdx + 1]) {
  const pwd = args[passIdx + 1];
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pwd, salt, 32).toString("hex");
  const tokenSecret = crypto.randomBytes(32).toString("hex");
  const webhookSecret = crypto.randomBytes(24).toString("hex");

  console.log("\n=======================================================");
  console.log("   GENERATED CREDENTIALS FOR .env FILE");
  console.log("=======================================================\n");
  console.log(`ADMIN_PASS_SALT=${salt}`);
  console.log(`ADMIN_PASS_HASH=${hash}`);
  console.log(`ADMIN_TOKEN_SECRET=${tokenSecret}`);
  console.log(`RZP_WEBHOOK_SECRET=${webhookSecret}`);
  console.log("\nCopy these values into your backend/.env file!\n");
  process.exit(0);
}

const REQUIRED_VARS = [
  { key: "RZP_KEY_ID", desc: "Razorpay Key ID (rzp_test_... or rzp_live_...)" },
  { key: "RZP_KEY_SECRET", desc: "Razorpay Key Secret" },
  { key: "RZP_WEBHOOK_SECRET", desc: "Razorpay Webhook Secret (from Razorpay Webhook settings)" },
  { key: "SUPABASE_URL", desc: "Supabase project URL (https://xxxx.supabase.co)" },
  { key: "SUPABASE_SERVICE_KEY", desc: "Supabase SERVICE key (secret role key, never expose in frontend)" },
  { key: "ADMIN_ID", desc: "Admin username/ID (e.g. owner)" },
  { key: "ADMIN_PASS_SALT", desc: "Admin password salt" },
  { key: "ADMIN_PASS_HASH", desc: "Admin password scrypt hash" },
  { key: "ADMIN_TOKEN_SECRET", desc: "Admin JWT/token HMAC secret" }
];

const OPTIONAL_VARS = [
  { key: "SITE_ORIGIN", desc: "Allowed frontend origin URLs (comma-separated, or empty for all)" },
  { key: "PORT", desc: "Server port (defaults to 3000)" }
];

console.log("\n=======================================================");
console.log("   FunnyMela Backend Environment Verification");
console.log("=======================================================\n");

let missing = 0;

console.log("--- REQUIRED VARIABLES ---");
for (const item of REQUIRED_VARS) {
  const val = process.env[item.key] || (item.key === "SUPABASE_SERVICE_KEY" ? process.env.SUPABASE_KEY : null);
  if (!val || val.includes("xxxx") || val.includes("paste_hash_here") || val.includes("choose_a_long") || val.includes("YOUR_")) {
    console.log(`❌  ${item.key.padEnd(22)}: MISSING or default placeholder! (${item.desc})`);
    missing++;
  } else {
    const masked = val.length > 8 ? val.slice(0, 4) + "..." + val.slice(-4) : "****";
    console.log(`✅  ${item.key.padEnd(22)}: OK [${masked}]`);
  }
}

console.log("\n--- OPTIONAL VARIABLES ---");
for (const item of OPTIONAL_VARS) {
  const val = process.env[item.key];
  if (val) {
    console.log(`ℹ️   ${item.key.padEnd(22)}: Set [${val}]`);
  } else {
    console.log(`⚪  ${item.key.padEnd(22)}: Not set (Default will be used)`);
  }
}

console.log("\n-------------------------------------------------------");
if (missing === 0) {
  console.log("🎉 All required environment variables are set! Ready to run.");
} else {
  console.log(`⚠️  ${missing} required environment variables are missing or unconfigured.`);
  console.log("To generate new admin credentials, run:");
  console.log('node check-env.js --password "YourAdminPassword"');
}
console.log("=======================================================\n");
