// Phone formatting + who-can-we-call rules (India: consent, DND, calling hours)
const cfg = require('../config');

function normalizePhone(raw) {
  const s = String(raw || '').trim();
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('+') && !digits.startsWith('91')) return '+' + digits; // non-Indian number
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10 || !'6789'.includes(digits[0])) {
    const err = new Error(`Invalid Indian mobile number: ${raw}`);
    err.status = 422;
    throw err;
  }
  return '+91' + digits;
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: cfg.TIMEZONE, hour: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10) % 24;
  const weekday = parts.find((p) => p.type === 'weekday').value; // Mon..Sun
  return { hour, weekday };
}

function withinCallingHours(date = new Date()) {
  const { hour, weekday } = localParts(date);
  if (cfg.NO_CALL_ON_SUNDAY && weekday === 'Sun') return false;
  return hour >= cfg.CALL_WINDOW_START && hour < cfg.CALL_WINDOW_END;
}

// Returns { ok, reason }. Use before every outbound call.
function canCall(lead, { checkHours = true, now } = {}) {
  if (lead.dnd) return { ok: false, reason: 'Lead is on Do-Not-Call list' };
  if (cfg.REQUIRE_CONSENT && !lead.consent) return { ok: false, reason: 'No calling consent recorded for this lead' };
  if (['won', 'lost'].includes(lead.stage)) return { ok: false, reason: `Lead stage is '${lead.stage}'` };
  if (checkHours && !withinCallingHours(now)) {
    return {
      ok: false,
      reason: `Outside calling hours (${cfg.CALL_WINDOW_START}:00-${cfg.CALL_WINDOW_END}:00 ${cfg.TIMEZONE}${cfg.NO_CALL_ON_SUNDAY ? ', no Sundays' : ''})`,
    };
  }
  return { ok: true, reason: 'ok' };
}

module.exports = { normalizePhone, withinCallingHours, canCall };
