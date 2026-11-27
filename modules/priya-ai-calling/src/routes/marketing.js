// Marketing Master <-> Tripti API (mounted at /api/ai-calling/marketing behind your CRM login)
const express = require('express');
const cfg = require('../config');
const { withinCallingHours } = require('../services/compliance');
const bridge = require('../services/marketingBridge');
const { Call, Appointment, Employee } = require('../models');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createMarketingRouter() {
  const r = express.Router();
  r.use(express.json());

  const companyEnabled = (req) => {
    const id = String(req.user?.company || req.user?._id || '');
    return !cfg.AI_CALL_COMPANY_IDS.length || cfg.AI_CALL_COMPANY_IDS.includes(id);
  };

  // Settings shown in the AI Agent popup
  r.get('/config', wrap(async (req, res) => {
    const team = await Employee.find({ active: true }).select('name role').lean();
    res.json({
      success: true,
      enabled: companyEnabled(req),
      allowedSources: cfg.AI_CALL_ALLOWED_SOURCES,
      autoCall: cfg.AUTO_CALL_NEW_LEADS,
      dryRun: cfg.DRY_RUN,
      testLock: cfg.AI_CALL_TEST_NUMBERS.length > 0,
      testNumbersCount: cfg.AI_CALL_TEST_NUMBERS.length,
      callWindow: `${cfg.CALL_WINDOW_START}:00-${cfg.CALL_WINDOW_END}:00${cfg.NO_CALL_ON_SUNDAY ? ', Mon-Sat' : ''}`,
      withinHours: withinCallingHours(),
      team,
    });
  }));

  // Badges for the Marketing grid: GET /status?ids=a,b,c
  r.get('/status', wrap(async (req, res) => {
    if (!companyEnabled(req)) return res.json({ success: true, status: {} });
    const ids = String(req.query.ids || '').split(',').filter((id) => /^[a-f0-9]{24}$/i.test(id)).slice(0, 100);
    if (!ids.length) return res.json({ success: true, status: {} });
    const M = bridge.getMarketingLeadModel();
    const leads = await M.find({ _id: { $in: ids }, company: req.user.company || req.user._id }).select('SENDER_MOBILE').lean();
    res.json({ success: true, status: await bridge.statusForLeads(leads) });
  }));

  // Full AI history of one Marketing lead
  r.get('/leads/:leadId', wrap(async (req, res) => {
    const mLead = await bridge.loadMarketingLead(req.params.leadId, req.user);
    if (!mLead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const eligibility = bridge.checkEligibility(mLead, {
      companyId: await bridge.companyIdOf(req.user), employeePhones: await bridge.employeePhones(),
    });
    delete eligibility.phone;
    res.json({ success: true, eligibility, withinHours: withinCallingHours(), dryRun: cfg.DRY_RUN, ...(await bridge.historyFor(mLead)) });
  }));

  // "Call with Tripti" (body: { ignoreHours: true } to test outside calling hours)
  r.post('/leads/:leadId/call', wrap(async (req, res) => {
    if (!companyEnabled(req)) return res.status(403).json({ success: false, error: 'AI calling is not enabled for this company' });
    const { call } = await bridge.callMarketingLead(req.params.leadId, req.user, { ignoreHours: !!req.body?.ignoreHours });
    res.json({
      success: true,
      message: cfg.DRY_RUN ? 'Test mode (DRY_RUN=true): call recorded, no real phone call made' : 'Arohi is calling the customer now',
      call,
    });
  }));

  // Queue many leads (dialer calls them inside calling hours; same safety rules apply)
  r.post('/queue', wrap(async (req, res) => {
    if (!companyEnabled(req)) return res.status(403).json({ success: false, error: 'AI calling is not enabled for this company' });
    const ids = (Array.isArray(req.body?.leadIds) ? req.body.leadIds : []).slice(0, 200);
    const results = [];
    let queued = 0;
    for (const id of ids) {
      const mLead = await bridge.loadMarketingLead(id, req.user);
      const r2 = mLead ? await bridge.queueMarketingLead(mLead, { companyId: await bridge.companyIdOf(req.user) }) : { queued: false, reason: 'Lead not found' };
      if (r2.queued) queued += 1;
      results.push({ leadId: id, name: mLead?.SENDER_NAME || '', ...r2 });
    }
    res.json({ success: true, message: `${queued} of ${ids.length} lead(s) queued for Arohi`, queued, results });
  }));

  // Recent AI calls + today's numbers for the AI Agent dashboard popup
  r.get('/recent', wrap(async (req, res) => {
    if (!companyEnabled(req)) return res.json({ success: true, calls: [], stats: {} });
    const limit = Math.min(+req.query.limit || 30, 100);
    const calls = await Call.find({}).sort({ createdAt: -1 }).limit(limit)
      .populate('lead', 'name phone company crmLeadId source stage').lean();
    const start = new Date(new Date().toLocaleString('en-US', { timeZone: cfg.TIMEZONE }));
    start.setHours(0, 0, 0, 0);
    const offsetMs = new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: cfg.TIMEZONE })).getTime();
    const since = new Date(start.getTime() + offsetMs);
    const [today, connected, transferred, visits, active] = await Promise.all([
      Call.countDocuments({ createdAt: { $gte: since } }),
      Call.countDocuments({ createdAt: { $gte: since }, durationSec: { $gt: 0 } }),
      Call.countDocuments({ createdAt: { $gte: since }, outcome: 'transferred' }),
      Appointment.countDocuments({ createdAt: { $gte: since } }),
      Call.countDocuments({ status: { $in: bridge.ACTIVE }, createdAt: { $gt: new Date(Date.now() - 30 * 60000) }, providerCallId: { $not: /^dryrun-/ } }),
    ]);
    res.json({ success: true, calls, stats: { today, connected, transferred, siteVisits: visits, active } });
  }));

  r.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    if (status >= 500) console.error('[ai-calling/marketing]', err);
    res.status(status).json({ success: false, error: err.message || 'Server error' });
  });
  return r;
}

module.exports = { createMarketingRouter };
