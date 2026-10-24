#!/usr/bin/env node
/**
 * FunnyMela Backend Connection & Setup Verifier
 * Run: node verify-setup.js
 */
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const Razorpay = require("razorpay");

const E = process.env;

async function verify() {
  console.log("\n=======================================================");
  console.log("   🎡 FUNNYMELA BACKEND & SUPABASE CONNECTION TEST");
  console.log("=======================================================\n");

  let allOk = true;

  // 1. Check Supabase
  console.log("1. Checking Supabase Database Connection...");
  const hasSupabaseUrl = E.SUPABASE_URL && !E.SUPABASE_URL.includes("YOUR_PROJECT_ID");
  const sbKey = E.SUPABASE_SERVICE_KEY || E.SUPABASE_KEY || E.SUPABASE_ANON_KEY;
  const hasSupabaseKey = sbKey && !sbKey.includes("YOUR_SUPABASE");

  if (!hasSupabaseUrl || !hasSupabaseKey) {
    console.log("   ❌ SUPABASE_URL or SUPABASE key is missing or contains placeholder values.");
    console.log("      -> Please update backend/.env with your Supabase credentials.");
    allOk = false;
  } else {
    try {
      const supabase = createClient(E.SUPABASE_URL, sbKey);
      const tables = ["orders", "ent", "donations", "events"];
      let tablesOk = true;

      for (const table of tables) {
        const { error } = await supabase.from(table).select("*").limit(1);
        if (error) {
          console.log(`   ❌ Table '${table}' check failed: ${error.message}`);
          tablesOk = false;
        } else {
          console.log(`   ✅ Table '${table}' found and accessible.`);
        }
      }

      if (tablesOk) {
        console.log("   🎉 Supabase connection is fully established and all 4 tables exist!\n");
      } else {
        console.log("   ⚠️  Some tables are missing! Run 'backend/schema.sql' in your Supabase SQL Editor.\n");
        allOk = false;
      }
    } catch (err) {
      console.log(`   ❌ Failed to connect to Supabase: ${err.message}\n`);
      allOk = false;
    }
  }

  // 2. Check Razorpay
  console.log("2. Checking Razorpay Payment Gateway...");
  const hasRzpKey = E.RZP_KEY_ID && !E.RZP_KEY_ID.includes("YOUR_KEY_ID");
  const hasRzpSecret = E.RZP_KEY_SECRET && !E.RZP_KEY_SECRET.includes("YOUR_KEY_SECRET");

  if (!hasRzpKey || !hasRzpSecret) {
    console.log("   ❌ RZP_KEY_ID or RZP_KEY_SECRET is missing or contains placeholder values.");
    console.log("      -> Get your TEST API keys from: Razorpay Dashboard > Settings > API Keys\n");
    allOk = false;
  } else {
    try {
      const rz = new Razorpay({ key_id: E.RZP_KEY_ID, key_secret: E.RZP_KEY_SECRET });
      await rz.orders.all({ count: 1 });
      console.log(`   ✅ Razorpay API key authenticated successfully! [Key: ${E.RZP_KEY_ID.slice(0, 10)}...]`);
      console.log(`   ✅ Webhook secret configured: ${!!E.RZP_WEBHOOK_SECRET}\n`);
    } catch (err) {
      console.log(`   ❌ Razorpay authentication failed: ${err.message || err.error?.description || err}`);
      console.log("      -> Check that your RZP_KEY_ID and RZP_KEY_SECRET are exact.\n");
      allOk = false;
    }
  }

  // 3. Admin credentials
  console.log("3. Checking Admin Panel Configuration...");
  if (E.ADMIN_ID && E.ADMIN_PASS_HASH && E.ADMIN_PASS_SALT && E.ADMIN_TOKEN_SECRET) {
    console.log(`   ✅ Admin configured! Username: '${E.ADMIN_ID}' (Default password: admin123)\n`);
  } else {
    console.log("   ⚠️  Admin credentials not completely configured in .env.\n");
  }

  console.log("=======================================================");
  if (allOk) {
    console.log("🚀 READY TO PLAY! Run: npm start to launch the server.");
  } else {
    console.log("👉 Please follow the setup guide to fill your .env keys.");
  }
  console.log("=======================================================\n");
}

verify().catch(console.error);
