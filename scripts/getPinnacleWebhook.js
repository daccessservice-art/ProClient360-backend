// scripts/getPinnacleWebhook.js
//
// Checks what webhook URL is CURRENTLY registered with Pinnacle right now.
// Run this FIRST, before setPinnacleWebhook.js, to confirm my diagnosis —
// it will almost certainly come back empty or missing, proving replies
// were never being routed anywhere.
//
// Usage:
//   node scripts/getPinnacleWebhook.js

require('dotenv').config();
const axios = require('axios');

const WABA_API_KEY = process.env.WABA_API_KEY;
const WABA_PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID;
const WABA_BASE_URL = process.env.WABA_BASE_URL || 'https://partnersv1.pinbot.ai/v3';

async function main() {
  if (!WABA_API_KEY || !WABA_PHONE_NUMBER_ID) {
    console.error('❌ Missing WABA_API_KEY or WABA_PHONE_NUMBER_ID in .env');
    process.exit(1);
  }

  try {
    const res = await axios.get(
      `${WABA_BASE_URL}/${WABA_PHONE_NUMBER_ID}/getwebhook`,
      { headers: { apikey: WABA_API_KEY } }
    );
    console.log('Current webhook registration:', res.data);
  } catch (err) {
    console.error('❌ Failed to fetch webhook config:', err.response?.data || err.message);
  }
}

main();