const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/landingPageLeadController');

// Simple rate limit: 10 submits / minute / IP
const hits = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_HITS  = 10;

const rateLimit = (req, res, next) => {
  const ip  = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW_MS) { rec.count = 0; rec.start = now; }
  rec.count++;
  hits.set(ip, rec);
  if (rec.count > MAX_HITS) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again after a minute.' });
  }
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) if (now - rec.start > WINDOW_MS) hits.delete(ip);
}, 5 * 60 * 1000).unref();

router.post('/submit', rateLimit, ctrl.submitLandingPageLead);

module.exports = router;