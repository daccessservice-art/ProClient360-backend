// scripts/setPinnacleWebhook.js
//
// ONE-TIME SETUP. Run this once from your own server (not from Claude's
// sandbox — Pinnacle's domain isn't reachable from there).
//
// This is the missing piece: replies were never reaching your server
// because Pinnacle didn't know where to send them. Per their own API
// docs (Section 37, "Set Webhook"), registering the callback URL is a
// POST call you make yourself — it is not a dashboard setting, and
// nothing in the app so far has ever made this call.
//
// Usage:
//   node scripts/setPinnacleWebhook.js
//
// Requires in your .env (already present):
//   WABA_API_KEY, WABA_PHONE_NUMBER_ID, WABA_BASE_URL
// Add this new one:
//   PUBLIC_APP_URL=https://your-real-domain.com   (NOT localhost — Pinnacle
//                                                    must be able to reach it)

require('dotenv').config();
const axios = require('axios');

const WABA_API_KEY = process.env.WABA_API_KEY;
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
const WABA_BASE_URL = process.env.WABA_BASE_URL || 'https://partnersv1.pinbot.ai/v3';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

async function main() {
  if (!WABA_API_KEY || !WABA_PHONE_NUMBER_ID) {
    console.error('❌ Missing WABA_API_KEY or WABA_PHONE_NUMBER_ID in .env');
    process.exit(1);
  }
  if (!PUBLIC_APP_URL) {
    console.error('❌ Missing PUBLIC_APP_URL in .env — set it to your real, publicly reachable domain, e.g. https://proclient360.com');
    process.exit(1);
  }

  const webhookUrl = `${PUBLIC_APP_URL.replace(/\/$/, '')}/api/campaigns/webhook`;

  console.log(`Registering webhook URL with Pinnacle: ${webhookUrl}`);

  try {
    const res = await axios.post(
      `${WABA_BASE_URL}/${WABA_PHONE_NUMBER_ID}/setwebhook`,
      { webhook_url: webhookUrl },
      { headers: { apikey: WABA_API_KEY, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Success:', res.data);
    console.log('\nNow send a real WhatsApp reply to test — check your server terminal for a [Campaign Webhook] log line.');
  } catch (err) {
    console.error('❌ Failed to register webhook:', err.response?.data || err.message);
    process.exit(1);
  }
}

main();