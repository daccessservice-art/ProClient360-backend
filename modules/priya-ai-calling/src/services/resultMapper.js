// PURE logic (no database): turns a Bolna execution into CRM changes.
// Kept separate so it is easy to test and to change.
const { OUTCOMES } = require('../models');

const FINAL_STATUSES = new Set(['completed', 'no-answer', 'busy', 'failed', 'canceled', 'stopped', 'error', 'balance-low']);
const STATUS_TO_OUTCOME = {
  'no-answer': 'no_answer', busy: 'busy', failed: 'failed', error: 'failed',
  'balance-low': 'failed', canceled: 'other', stopped: 'other',
};
const OUTCOME_TO_STAGE = {
  appointment_booked: 'appointment', interested: 'interested', callback_requested: 'callback',
  not_interested: 'not_interested', wrong_number: 'lost', do_not_call: 'lost', transferred: 'interested',
};
const RETRYABLE = new Set(['no_answer', 'busy', 'voicemail', 'failed']);

// Field names to create in Bolna's Extractions tab (aliases make it tolerant of small naming differences)
const ALIASES = {
  outcome: ['call_outcome', 'outcome', 'result'],
  visitDatetime: ['site_visit_datetime', 'site_visit_date_time', 'appointment_datetime', 'visit_date_time', 'site_visit_date'],
  visitAddress: ['site_visit_address', 'address', 'visit_address'],
  callbackTime: ['callback_time', 'call_back_time', 'callback_datetime'],
  requirement: ['requirement', 'product_required', 'products_needed', 'need'],
  quantity: ['quantity', 'size', 'number_of_cameras', 'site_size'],
  placeType: ['place_type', 'type_of_place', 'site_type'],
  city: ['city', 'location', 'area'],
  timeline: ['timeline', 'install_timeline', 'installation_timeline'],
  interestLevel: ['interest_level', 'lead_temperature'],
  customerName: ['customer_name', 'name'],
  brochure: ['brochure_requested', 'send_brochure', 'whatsapp_brochure'],
  dnd: ['do_not_call', 'dnd', 'dont_call_again'],
};

const EMPTY = new Set(['', 'null', 'none', 'n/a', 'na', 'undefined']);

const LEAF_KEYS = ['value', 'objective', 'subjective'];
const normKey = (k) => String(k).trim().toLowerCase().replace(/[\s-]+/g, '_');
const isEmpty = (v) => v === null || v === undefined || (typeof v !== 'object' && EMPTY.has(String(v).trim().toLowerCase()));

// Bolna extracted_data comes in several shapes; all are flattened to { field: answer }:
//   { city: "Pune" }
//   { city: { value: "Pune", confidence: 0.9 } }
//   { "Lead Details": { city: { objective: null, subjective: "Pune", confidence: 0.9, ... } },
//     "General": { "Call Summary": { subjective: "..." } } }        <- seen on real calls (Nov 2026)
function flatten(data, out = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (LEAF_KEYS.some((lk) => lk in v)) {
        const ans = [v.value, v.objective, v.subjective].find((x) => !isEmpty(x));
        if (!isEmpty(ans)) out[normKey(k)] = ans;
      } else {
        flatten(v, out); // category group, e.g. "Lead Details"
      }
    } else if (!isEmpty(v)) {
      out[normKey(k)] = v;
    }
  }
  return out;
}

const pick = (ex, field) => {
  for (const k of ALIASES[field]) if (k in ex) return ex[k];
  return undefined;
};
const truthy = (v) => ['true', 'yes', 'y', '1', 'haan', 'ha'].includes(String(v).trim().toLowerCase());

function outcomeFromExtracted(ex) {
  if (truthy(pick(ex, 'dnd'))) return 'do_not_call';
  const raw = pick(ex, 'outcome');
  if (raw) {
    const o = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (OUTCOMES.includes(o)) return o;
    const rules = [['do_not', 'do_not_call'], ['wrong', 'wrong_number'], ['not_interest', 'not_interested'],
      ['book', 'appointment_booked'], ['visit', 'appointment_booked'], ['call_back', 'callback_requested'],
      ['callback', 'callback_requested'], ['interest', 'interested']];
    for (const [k, v] of rules) if (o.includes(k)) return v;
  }
  if (pick(ex, 'visitDatetime')) return 'appointment_booked';
  if (pick(ex, 'callbackTime')) return 'callback_requested';
  return null;
}

// Main function: execution (from webhook or GET /executions) + current lead -> plan of changes
function planFromExecution(execution, lead, now = new Date()) {
  const status = execution.status || '';
  const tel = execution.telephony_data || {};
  const extracted = flatten(execution.extracted_data);
  const plan = { final: FINAL_STATUSES.has(status), status, call: {}, lead: {}, appointments: [], followUps: [] };
  if (!plan.final) {
    plan.call.status = status;
    return plan;
  }

  const dur = execution.conversation_duration ?? tel.duration;
  const c = plan.call;
  c.status = 'ended';
  c.endedReason = tel.hangup_reason || execution.termination_reason || execution.error_message || status;
  if (execution.transcript) c.transcript = execution.transcript;
  const summary = execution.summary || extracted.call_summary;
  if (summary) c.summary = String(summary);
  delete extracted.call_summary;
  if (tel.recording_url) c.recordingUrl = tel.recording_url;
  if (dur !== undefined && dur !== null && !Number.isNaN(Number(dur))) c.durationSec = Math.round(Number(dur));
  if (Object.keys(extracted).length) c.extracted = extracted;
  c.endedAt = now;

  if (status === 'completed') {
    c.outcome = outcomeFromExtracted(extracted) || 'other';
    const reason = String(c.endedReason).toLowerCase();
    if (reason.includes('voicemail')) c.outcome = 'voicemail';
    if (reason.includes('transfer') && !['appointment_booked', 'do_not_call'].includes(c.outcome)) c.outcome = 'transferred';
  } else {
    c.outcome = STATUS_TO_OUTCOME[status] || 'other';
  }
  if (status !== 'completed' || !lead) return plan;

  // ---- lead updates
  const L = plan.lead;
  const name = pick(extracted, 'customerName');
  if (name && (!lead.name || lead.name === 'Unknown caller')) L.name = String(name);
  if (pick(extracted, 'placeType')) L.placeType = String(pick(extracted, 'placeType'));
  if (pick(extracted, 'city')) L.city = String(pick(extracted, 'city'));
  const req = [pick(extracted, 'requirement'), pick(extracted, 'quantity')].filter(Boolean).join(' ');
  if (req) L.productInterest = req.slice(0, 200);

  const bits = ['timeline', 'interestLevel'].filter((k) => pick(extracted, k)).map((k) => `${k}: ${pick(extracted, k)}`);
  if (c.summary || bits.length) {
    const stamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    L.appendNote = `[${stamp} AI call] ${c.summary || ''}${bits.length ? ' | ' + bits.join('; ') : ''}`.trim();
  }
  if (c.outcome === 'do_not_call') L.dnd = true;

  const newStage = OUTCOME_TO_STAGE[c.outcome];
  if (newStage && (!['appointment', 'won'].includes(lead.stage) || ['appointment', 'lost'].includes(newStage))) L.stage = newStage;

  // ---- tasks for the sales team
  if (c.outcome === 'appointment_booked' && pick(extracted, 'visitDatetime')) {
    plan.appointments.push({
      scheduledFor: String(pick(extracted, 'visitDatetime')).slice(0, 80),
      address: pick(extracted, 'visitAddress') ? String(pick(extracted, 'visitAddress')) : undefined,
      purpose: req ? `site visit: ${req}`.slice(0, 200) : 'site visit',
    });
  }
  if (c.outcome === 'callback_requested' || pick(extracted, 'callbackTime')) {
    plan.followUps.push({ kind: 'call', dueAt: pick(extracted, 'callbackTime') ? String(pick(extracted, 'callbackTime')) : undefined, notes: c.summary });
  }
  if (truthy(pick(extracted, 'brochure'))) {
    plan.followUps.push({ kind: 'whatsapp', dueAt: 'today', notes: 'Send DAccess brochure on WhatsApp' });
  }
  return plan;
}

// Campaign retry decision
function campaignLeadAfterCall(cl, outcome, cfg, now = new Date()) {
  const upd = { lastOutcome: outcome };
  if (RETRYABLE.has(outcome) && cl.attempts < cfg.MAX_ATTEMPTS) {
    upd.status = 'pending';
    upd.nextAttemptAt = new Date(now.getTime() + cfg.RETRY_AFTER_MINUTES * 60000);
  } else if (RETRYABLE.has(outcome)) upd.status = 'failed';
  else upd.status = 'done';
  return upd;
}

module.exports = { planFromExecution, campaignLeadAfterCall, flatten, outcomeFromExtracted, FINAL_STATUSES, OUTCOME_TO_STAGE };
