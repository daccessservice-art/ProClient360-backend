// Receives call updates from Bolna.
// Bolna: agent -> Extractions tab -> "Push all execution data to webhook"
// URL:   https://YOUR_DOMAIN/webhooks/bolna?token=YOUR_WEBHOOK_SECRET
const express = require('express');
const cfg = require('../config');
const { handleExecutionEvent } = require('../services/callService');

function createBolnaWebhookRouter() {
  const r = express.Router();
  r.post('/webhooks/bolna', express.json({ limit: '5mb' }), async (req, res) => {
    if (req.query.token !== cfg.WEBHOOK_SECRET) return res.status(401).json({ error: 'Bad webhook token' });
    if (cfg.ENFORCE_BOLNA_IPS) {
      const ip = String(req.get('x-forwarded-for') || req.socket.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '');
      if (!cfg.BOLNA_WEBHOOK_IPS.includes(ip)) return res.status(403).json({ error: `IP ${ip} not allowed` });
    }
    const body = req.body || {};
    const ex = body.data && typeof body.data === 'object' && body.data.status ? body.data : body;
    try {
      const call = await handleExecutionEvent(ex);
      res.json({ ok: true, callId: call._id });
    } catch (err) {
      // Always answer 200 quickly so Bolna doesn't keep retrying; the error is logged
      console.error('[bolna-webhook] failed to process event', ex?.id, err.message);
      res.json({ ok: false });
    }
  });
  return r;
}

module.exports = { createBolnaWebhookRouter };
