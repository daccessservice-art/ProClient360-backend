// Bridge between your existing Marketing Master leads (collection "leads", model "lead")
// and Tripti (ai_* collections). Your existing lead documents are only READ here, never changed.
const cfg = require('../config');
const { normalizePhone } = require('./compliance');
const { Lead, Call, Appointment, FollowUp, Campaign, CampaignLead, Employee } = require('../models');

let MarketingLead = null; // your Mongoose model, injected from mountAiCalling(app, { marketingLeadModel })
function setMarketingLeadModel(model) { MarketingLead = model; }
function getMarketingLeadModel() {
  if (!MarketingLead) { const e = new Error('Marketing lead model not configured (pass marketingLeadModel to mountAiCalling)'); e.status = 500; throw e; }
  return MarketingLead;
}

const ACTIVE = ['queued', 'scheduled', 'prepared', 'initiated', 'ringing', 'in-progress', 'call-disconnected'];
const lower = (s) => String(s || '').trim().toLowerCase();
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// ------------------------------------------------------------ pure helpers (unit tested)
function isSourceAllowed(source, allowed = cfg.AI_CALL_ALLOWED_SOURCES) {
  const list = allowed.map(lower);
  if (list.includes('all') || list.includes('*')) return true;
  return list.includes(lower(source || 'Direct'));
}

// Returns { ok, reason, phone }. Never throws.
function checkEligibility(mLead, { companyId, employeePhones = [], c = cfg } = {}) {
  if (!mLead) return { ok: false, reason: 'Lead not found' };
  const leadCompany = String(mLead.company?._id || mLead.company || '');
  if (companyId && leadCompany && leadCompany !== String(companyId)) return { ok: false, reason: 'Lead belongs to another company' };
  if (c.AI_CALL_COMPANY_IDS.length && !c.AI_CALL_COMPANY_IDS.includes(leadCompany)) {
    return { ok: false, reason: 'AI calling is not enabled for this company' };
  }
  if (!isSourceAllowed(mLead.SOURCE, c.AI_CALL_ALLOWED_SOURCES)) {
    return { ok: false, reason: `Source "${mLead.SOURCE}" is not enabled for AI calling yet (allowed: ${c.AI_CALL_ALLOWED_SOURCES.join(', ')})` };
  }
  if (['Won', 'Lost'].includes(mLead.STATUS)) return { ok: false, reason: `Lead is already ${mLead.STATUS}` };
  let phone;
  try { phone = normalizePhone(mLead.SENDER_MOBILE); } catch { return { ok: false, reason: 'Mobile number is missing or invalid' }; }
  if (employeePhones.map(last10).includes(last10(phone))) {
    return { ok: false, reason: 'This number belongs to a team member (call-forward number) - never called as a customer' };
  }
  if (c.AI_CALL_TEST_NUMBERS.length && !c.AI_CALL_TEST_NUMBERS.map(last10).includes(last10(phone))) {
    return { ok: false, reason: 'Testing lock is on: only numbers in AI_CALL_TEST_NUMBERS can be called' };
  }
  return { ok: true, reason: 'ok', phone };
}

function mapMarketingLead(mLead) {
  const clean = (v) => (v == null ? '' : String(v).trim());
  const place = mLead.industryType === 'Other' ? mLead.industryTypeOther : mLead.industryType;
  return {
    name: clean(mLead.SENDER_NAME) || clean(mLead.SENDER_COMPANY) || 'Customer',
    email: clean(mLead.SENDER_EMAIL),
    company: clean(mLead.SENDER_COMPANY),
    city: clean(mLead.SENDER_CITY),
    productInterest: clean(mLead.QUERY_PRODUCT_NAME),
    placeType: clean(place),
    source: clean(mLead.SOURCE) || 'Direct',
    crmLeadId: String(mLead._id),
  };
}

// ------------------------------------------------------------ DB helpers
async function employeePhones() {
  return (await Employee.find({}).select('phone').lean()).map((e) => e.phone);
}

async function loadMarketingLead(leadId, user) {
  const M = getMarketingLeadModel();
  if (!/^[a-f0-9]{24}$/i.test(String(leadId))) return null;
  const q = { _id: leadId };
  if (user) q.company = user.company || user._id;
  return M.findOne(q).lean();
}

// Customer-centric: one AI lead per phone number (repeat enquiries share one call history)
async function findAiLeadFor(mLead) {
  let phone = null;
  try { phone = normalizePhone(mLead.SENDER_MOBILE); } catch { /* ignore */ }
  return (phone && await Lead.findOne({ phone })) || Lead.findOne({ crmLeadId: String(mLead._id) });
}

async function syncAiLead(mLead, phone) {
  let ai = await Lead.findOne({ phone });
  if (!ai) ai = new Lead({ phone });
  Object.assign(ai, mapMarketingLead(mLead), { consent: true }); // customer sent an enquiry -> consent to be called back
  await ai.save();
  return ai;
}

async function companyIdOf(user) { return user ? String(user.company || user._id) : null; }

// "Call with Tripti" button
async function callMarketingLead(leadId, user, { ignoreHours = false } = {}) {
  const { startCall } = require('./callService');
  const mLead = await loadMarketingLead(leadId, user);
  const elig = checkEligibility(mLead, { companyId: await companyIdOf(user), employeePhones: await employeePhones() });
  if (!elig.ok) { const e = new Error(elig.reason); e.status = 422; throw e; }
  const ai = await syncAiLead(mLead, elig.phone);
  const call = await startCall(ai, { checkHours: !ignoreHours });
  return { call, aiLead: ai };
}

// Queue for automatic calling (dialer calls it inside calling hours, with retries)
async function getAutoCampaign() {
  let camp = await Campaign.findOne({ name: cfg.AUTO_CALL_CAMPAIGN_NAME });
  if (!camp) camp = await Campaign.create({ name: cfg.AUTO_CALL_CAMPAIGN_NAME, assignRole: 'sales', status: 'running' });
  if (camp.status !== 'running') { camp.status = 'running'; await camp.save(); }
  return camp;
}

async function queueMarketingLead(mLead, { companyId } = {}) {
  const elig = checkEligibility(mLead, { companyId, employeePhones: await employeePhones() });
  if (!elig.ok) return { queued: false, reason: elig.reason };
  const ai = await syncAiLead(mLead, elig.phone);
  const camp = await getAutoCampaign();
  // One queue entry per customer: re-use it (a customer can enquire again later)
  const existing = await CampaignLead.findOne({ campaign: camp._id, lead: ai._id });
  const stuck = existing && existing.status === 'calling' && existing.updatedAt && existing.updatedAt < new Date(Date.now() - 30 * 60000);
  if (existing && (existing.status === 'pending' || (existing.status === 'calling' && !stuck))) {
    return { queued: false, reason: 'Already in the call queue' };
  }
  if (existing) {
    Object.assign(existing, { status: 'pending', attempts: 0, nextAttemptAt: null, skipReason: null, lastOutcome: null });
    await existing.save();
  } else {
    try {
      await CampaignLead.create({ campaign: camp._id, lead: ai._id, status: 'pending' });
    } catch (e) {
      if (e && e.code === 11000) return { queued: false, reason: 'Already in the call queue' };
      throw e;
    }
  }
  return { queued: true, reason: 'Queued - Tripti will call within calling hours' };
}

// Hook for leadController.createLead - never throws, never blocks lead creation
async function onMarketingLeadCreated(mLead) {
  try {
    if (!cfg.AUTO_CALL_NEW_LEADS || !mLead) return { queued: false, reason: 'auto-call off' };
    if (mLead.feasibility && mLead.feasibility !== 'none') return { queued: false, reason: 'not a Marketing Master lead' };
    const r = await queueMarketingLead(typeof mLead.toObject === 'function' ? mLead.toObject() : mLead);
    console.log(`[ai-calling] new lead ${mLead._id}: ${r.reason}`);
    return r;
  } catch (e) {
    console.warn('[ai-calling] auto-call skipped:', e.message);
    return { queued: false, reason: e.message };
  }
}

// Calls still "active" for 20s+ -> ask Bolna for the latest (works even before the webhook is set up)
async function refreshActiveCalls(calls) {
  const { syncCall } = require('./callService');
  const old = Date.now() - 20000;
  const todo = calls.filter((c) => ACTIVE.includes(c.status) && c.providerCallId && !String(c.providerCallId).startsWith('dryrun-')
    && new Date(c.createdAt).getTime() < old).slice(0, 3);
  for (const c of todo) {
    try { await syncCall(c); } catch (e) { /* Bolna not reachable - keep old status */ }
  }
  return todo.length;
}

async function historyFor(mLead) {
  const ai = await findAiLeadFor(mLead);
  if (!ai) return { aiLead: null, calls: [], appointments: [], followUps: [] };
  let calls = await Call.find({ lead: ai._id }).sort({ createdAt: -1 }).lean();
  if (await refreshActiveCalls(calls)) calls = await Call.find({ lead: ai._id }).sort({ createdAt: -1 }).lean();
  const [appointments, followUps, aiLead] = await Promise.all([
    Appointment.find({ lead: ai._id }).sort({ createdAt: -1 }).populate('assignedTo', 'name phone').lean(),
    FollowUp.find({ lead: ai._id }).sort({ createdAt: -1 }).populate('assignedTo', 'name phone').lean(),
    Lead.findById(ai._id).populate('assignedTo', 'name phone role').lean(),
  ]);
  return { aiLead, calls, appointments, followUps };
}

// Small badge data for the Marketing grid: { [marketingLeadId]: { calls, lastStatus, lastOutcome, lastAt, stage } }
async function statusForLeads(mLeads) {
  const phoneOf = new Map();
  for (const m of mLeads) { try { phoneOf.set(String(m._id), normalizePhone(m.SENDER_MOBILE)); } catch { /* skip */ } }
  const phones = [...new Set(phoneOf.values())];
  const aiLeads = await Lead.find({ phone: { $in: phones } }).select('_id phone stage').lean();
  const byPhone = new Map(aiLeads.map((a) => [a.phone, a]));
  const ids = aiLeads.map((a) => a._id);
  const agg = await Call.aggregate([
    { $match: { lead: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$lead', calls: { $sum: 1 }, lastStatus: { $first: '$status' }, lastOutcome: { $first: '$outcome' }, lastAt: { $first: '$createdAt' }, lastProviderId: { $first: '$providerCallId' } } },
  ]);
  const byLead = new Map(agg.map((a) => [String(a._id), a]));
  const out = {};
  for (const [mid, phone] of phoneOf) {
    const a = byPhone.get(phone);
    const s = a && byLead.get(String(a._id));
    if (s) out[mid] = { calls: s.calls, lastStatus: s.lastStatus, lastOutcome: s.lastOutcome, lastAt: s.lastAt, stage: a.stage, dryRun: String(s.lastProviderId || '').startsWith('dryrun-') };
  }
  return out;
}

module.exports = {
  setMarketingLeadModel, getMarketingLeadModel, isSourceAllowed, checkEligibility, mapMarketingLead,
  loadMarketingLead, callMarketingLead, queueMarketingLead, onMarketingLeadCreated, historyFor, statusForLeads,
  employeePhones, companyIdOf, ACTIVE,
};
