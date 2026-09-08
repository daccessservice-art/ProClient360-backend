// routes/exotelCallingRoutes.js
// ============================================================
// Outbound calling via Exotel's Connect API.
//
// ⚠️ IMPORTANT — INBOUND CALLS work differently on Exotel than Twilio:
// Twilio used a webhook (POST /incoming-call) that dynamically returns
// TwiML. Exotel instead requires you to build a "Flow" (visually, in
// the Exotel dashboard under App Bazaar/Flows) with a Voicebot Applet
// node pointing to wss://yourdomain.com/exotel-media-stream. Once built,
// that Flow gets an App ID, and you attach your ExoPhone number to it
// in the dashboard. There is no inbound route to write here — it's
// configured entirely in Exotel's dashboard.
//
// This file only handles OUTBOUND calls, which DO need code, using
// the same Flow's App ID as the destination for the call once connected.
// ============================================================

const express = require('express');
const router = express.Router();

const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;
const EXOTEL_SUBDOMAIN = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
const EXOTEL_PHONE_NUMBER = process.env.EXOTEL_PHONE_NUMBER;
// ⚠️ Fill this in once you've built your Flow with the Voicebot Applet in the dashboard
const EXOTEL_FLOW_APP_ID = process.env.EXOTEL_FLOW_APP_ID;

// ------------------------------------------------------------
// OUTBOUND: call any number, connect them to the AI agent
// POST /api/exotel-calling/make-call   body: { "to": "+917755994638" }
// ------------------------------------------------------------
router.post('/make-call', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number, e.g. +917755994638' });

  if (!EXOTEL_FLOW_APP_ID) {
    return res.status(500).json({
      error: 'EXOTEL_FLOW_APP_ID is not set — build your Voicebot Applet Flow in the Exotel dashboard first, then add its App ID to your .env',
    });
  }

  try {
    // Exotel's classic Connect API — connects "From" number to a Flow/App
    const url = `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@${EXOTEL_SUBDOMAIN}/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`;

    const params = new URLSearchParams({
      From: to, // the customer's number — Exotel calls them first
      CallerId: EXOTEL_PHONE_NUMBER, // your ExoPhone, shown as caller ID
      Url: `http://my.exotel.com/${EXOTEL_SID}/exoml/start_voice/${EXOTEL_FLOW_APP_ID}`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ExotelAgent] Outbound call failed:', data);
      return res.status(500).json({ error: data });
    }

    console.log(`📤 [ExotelAgent] Outbound call initiated to ${to}`, data);
    res.json({ status: 'calling', data });
  } catch (err) {
    console.error('[ExotelAgent] Outbound call error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'exotel-calling-agent' });
});

module.exports = router;