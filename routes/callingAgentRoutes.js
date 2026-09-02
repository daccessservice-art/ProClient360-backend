const express = require('express');
const router = express.Router();
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID,
  process.env.TWILIO_API_KEY_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);

function buildStreamTwiml(host) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;
}

router.post('/incoming-call', (req, res) => {
  const host = req.headers.host;
  res.type('text/xml');
  res.send(buildStreamTwiml(host));
});

router.post('/make-call', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number, e.g. +917755994638' });
  const host = req.headers.host;
  try {
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: buildStreamTwiml(host),
    });
    console.log(`📤 [CallingAgent] Outbound call to ${to} — Call SID: ${call.sid}`);
    res.json({ status: 'calling', callSid: call.sid });
  } catch (err) {
    console.error('[CallingAgent] Outbound call failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'calling-agent' });
});

module.exports = router;