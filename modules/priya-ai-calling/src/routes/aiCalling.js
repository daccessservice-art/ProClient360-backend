// REST API for your CRM frontend: leads, "Call with AI", call log, campaigns, appointments, follow-ups, stats.
// Mount: app.use('/api/ai-calling', yourAuthMiddleware, createAiCallingRouter())
const express = require('express');
const mongoose = require('mongoose');
const cfg = require('../config');
const { normalizePhone } = require('../services/compliance');
const callService = require('../services/callService');
const { Lead, Call, Appointment, FollowUp, Campaign, CampaignLead, Employee, STAGES, ROLES } = require('../models');
const { ensureAssigned } = require('../services/assignment');

const LEAD_FIELDS = ['crmLeadId', 'name', 'phone', 'email', 'company', 'placeType', 'city', 'productInterest',
  'source', 'stage', 'notes', 'consent', 'dnd', 'assignedTo'];
const pickFields = (body) => {
  const out = Object.fromEntries(Object.entries(body || {}).filter(([k]) => LEAD_FIELDS.includes(k)));
  if ('assignedTo' in out && out.assignedTo && !mongoose.isValidObjectId(out.assignedTo)) {
    const e = new Error('assignedTo must be an employee id'); e.status = 422; throw e;
  }
  if (out.assignedTo === '') out.assignedTo = null;
  return out;
};
const EMP_FIELDS = ['crmUserId', 'name', 'phone', 'email', 'role', 'areas', 'active'];
const pickEmp = (body) => Object.fromEntries(Object.entries(body || {}).filter(([k]) => EMP_FIELDS.includes(k)));
const EMP_POP = ['assignedTo', 'name phone role'];
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const isId = (id) => mongoose.isValidObjectId(id);

function apiKeyGuard(req, res, next) {
  if (cfg.CRM_API_KEY && req.get('X-API-Key') !== cfg.CRM_API_KEY) return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  return next();
}

function createAiCallingRouter() {
  const r = express.Router();
  r.use(express.json());
  r.use(apiKeyGuard);

  // ------------------------------------------------------------ leads
  r.post('/leads', wrap(async (req, res) => {
    const data = pickFields(req.body);
    if (!data.name || !data.phone) return res.status(422).json({ error: 'name and phone are required' });
    data.phone = normalizePhone(data.phone);
    if (await Lead.exists({ phone: data.phone })) return res.status(409).json({ error: 'A lead with this phone already exists' });
    res.status(201).json(await Lead.create(data));
  }));

  // Create or update by your CRM's lead id (handy for syncing from your existing Lead collection)
  r.put('/leads/by-crm-id/:crmLeadId', wrap(async (req, res) => {
    const data = pickFields(req.body);
    if (data.phone) data.phone = normalizePhone(data.phone);
    const lead = await Lead.findOneAndUpdate({ crmLeadId: req.params.crmLeadId }, { ...data, crmLeadId: req.params.crmLeadId },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.json(lead);
  }));

  r.get('/leads', wrap(async (req, res) => {
    const q = {};
    if (req.query.stage) q.stage = req.query.stage;
    if (req.query.q) q.$or = [{ name: new RegExp(escapeRe(req.query.q), 'i') }, { phone: new RegExp(escapeRe(req.query.q)) }];
    if (req.query.assignedTo && isId(req.query.assignedTo)) q.assignedTo = req.query.assignedTo;
    res.json(await Lead.find(q).sort({ updatedAt: -1 }).limit(Math.min(+req.query.limit || 100, 1000)).populate(...EMP_POP));
  }));

  r.get('/leads/by-phone', wrap(async (req, res) => {
    const lead = await callService.findLeadByPhone(req.query.phone);
    return lead ? res.json(lead) : res.status(404).json({ error: 'Lead not found' });
  }));

  r.get('/leads/:id', wrap(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Lead not found' });
    const lead = await Lead.findById(req.params.id).populate(...EMP_POP);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const [calls, appointments, followUps] = await Promise.all([
      Call.find({ lead: lead._id }).sort({ createdAt: -1 }),
      Appointment.find({ lead: lead._id }).sort({ createdAt: -1 }),
      FollowUp.find({ lead: lead._id }).sort({ createdAt: -1 }),
    ]);
    res.json({ lead, calls, appointments, followUps });
  }));

  r.patch('/leads/:id', wrap(async (req, res) => {
    const data = pickFields(req.body);
    if (data.stage && !STAGES.includes(data.stage)) return res.status(422).json({ error: `stage must be one of ${STAGES}` });
    if (data.phone) data.phone = normalizePhone(data.phone);
    const lead = isId(req.params.id) && await Lead.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    return lead ? res.json(lead) : res.status(404).json({ error: 'Lead not found' });
  }));

  // Assign a lead: { employeeId } to a specific person, or { role: 'sales' | 'marketing' | 'service' } for automatic
  r.post('/leads/:id/assign', wrap(async (req, res) => {
    const lead = isId(req.params.id) && await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { employeeId, role } = req.body || {};
    if (employeeId) {
      const emp = isId(employeeId) && await Employee.findById(employeeId);
      if (!emp || !emp.active) return res.status(422).json({ error: 'Employee not found or inactive' });
      lead.assignedTo = emp._id;
      await lead.save();
    } else {
      if (role && !ROLES.includes(role)) return res.status(422).json({ error: `role must be one of ${ROLES}` });
      lead.assignedTo = null;
      if (!(await ensureAssigned(lead, { role: role || 'sales' }))) return res.status(422).json({ error: 'No active employee for this role' });
    }
    res.json(await Lead.findById(lead._id).populate(...EMP_POP));
  }));

  // ------------------------------------------------------------ employees (sales / marketing / service team)
  r.get('/employees', wrap(async (req, res) => {
    const q = {};
    if (req.query.role) q.role = req.query.role;
    if (req.query.active) q.active = req.query.active === 'true';
    const emps = await Employee.find(q).sort({ role: 1, name: 1 }).lean();
    const counts = Object.fromEntries((await Lead.aggregate([{ $match: { assignedTo: { $ne: null } } }, { $group: { _id: '$assignedTo', n: { $sum: 1 } } }])).map((x) => [String(x._id), x.n]));
    res.json(emps.map((e) => ({ ...e, leads: counts[String(e._id)] || 0 })));
  }));
  r.post('/employees', wrap(async (req, res) => {
    const data = pickEmp(req.body);
    if (!data.name || !data.phone) return res.status(422).json({ error: 'name and phone are required' });
    data.phone = normalizePhone(data.phone);
    if (typeof data.areas === 'string') data.areas = data.areas.split(',').map((a) => a.trim()).filter(Boolean);
    res.status(201).json(await Employee.create(data));
  }));
  r.put('/employees/by-crm-id/:crmUserId', wrap(async (req, res) => {
    const data = pickEmp(req.body);
    if (data.phone) data.phone = normalizePhone(data.phone);
    if (typeof data.areas === 'string') data.areas = data.areas.split(',').map((a) => a.trim()).filter(Boolean);
    res.json(await Employee.findOneAndUpdate({ crmUserId: req.params.crmUserId }, { ...data, crmUserId: req.params.crmUserId },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }));
  }));
  r.patch('/employees/:id', wrap(async (req, res) => {
    const data = pickEmp(req.body);
    if (data.phone) data.phone = normalizePhone(data.phone);
    if (typeof data.areas === 'string') data.areas = data.areas.split(',').map((a) => a.trim()).filter(Boolean);
    const emp = isId(req.params.id) && await Employee.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    return emp ? res.json(emp) : res.status(404).json({ error: 'Employee not found' });
  }));

  // ------------------------------------------------------------ "Call with AI" button
  r.post('/leads/:id/call', wrap(async (req, res) => {
    const lead = isId(req.params.id) && await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const call = await callService.startCall(lead, { checkHours: req.query.ignore_hours !== 'true' });
    res.status(201).json(call);
  }));

  // ------------------------------------------------------------ calls
  r.get('/calls', wrap(async (req, res) => {
    const q = {};
    if (req.query.lead && isId(req.query.lead)) q.lead = req.query.lead;
    if (req.query.outcome) q.outcome = req.query.outcome;
    res.json(await Call.find(q).sort({ createdAt: -1 }).limit(Math.min(+req.query.limit || 100, 1000)).populate('lead', 'name phone company'));
  }));

  r.get('/calls/:id', wrap(async (req, res) => {
    const call = isId(req.params.id) && await Call.findById(req.params.id).populate('lead', 'name phone company');
    return call ? res.json(call) : res.status(404).json({ error: 'Call not found' });
  }));

  r.post('/calls/:id/sync', wrap(async (req, res) => {
    const call = isId(req.params.id) && await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json(await callService.syncCall(call));
  }));

  // ------------------------------------------------------------ campaigns
  r.post('/campaigns', wrap(async (req, res) => {
    if (!req.body?.name) return res.status(422).json({ error: 'name is required' });
    const camp = await Campaign.create({ name: req.body.name, callType: req.body.callType || 'promotional', assignRole: req.body.assignRole || 'sales' });
    const added = await addLeads(camp, req.body.leadIds || []);
    res.status(201).json({ ...camp.toObject(), added });
  }));

  r.post('/campaigns/:id/leads', wrap(async (req, res) => {
    const camp = isId(req.params.id) && await Campaign.findById(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ added: await addLeads(camp, req.body.leadIds || []) });
  }));

  r.post('/campaigns/:id/:action', wrap(async (req, res) => {
    const map = { start: 'running', pause: 'paused', resume: 'running', stop: 'completed' };
    if (!map[req.params.action]) return res.status(404).json({ error: 'Action must be start/pause/resume/stop' });
    const camp = isId(req.params.id) && await Campaign.findByIdAndUpdate(req.params.id, { status: map[req.params.action] }, { new: true });
    return camp ? res.json(camp) : res.status(404).json({ error: 'Campaign not found' });
  }));

  r.get('/campaigns', wrap(async (req, res) => {
    const camps = await Campaign.find().sort({ createdAt: -1 }).lean();
    for (const c of camps) {
      const counts = await CampaignLead.aggregate([{ $match: { campaign: c._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
      c.leadStatus = Object.fromEntries(counts.map((x) => [x._id, x.n]));
      c.appointments = await Call.countDocuments({ campaign: c._id, outcome: 'appointment_booked' });
    }
    res.json(camps);
  }));

  // ------------------------------------------------------------ tasks for sales team
  r.get('/appointments', wrap(async (req, res) => {
    const q = req.query.assignedTo && isId(req.query.assignedTo) ? { assignedTo: req.query.assignedTo } : {};
    res.json(await Appointment.find(q).sort({ createdAt: -1 }).limit(500).populate('lead', 'name phone company').populate(...EMP_POP));
  }));
  r.get('/followups', wrap(async (req, res) => {
    const q = req.query.all === 'true' ? {} : { done: false };
    if (req.query.assignedTo && isId(req.query.assignedTo)) q.assignedTo = req.query.assignedTo;
    res.json(await FollowUp.find(q).sort({ createdAt: -1 }).limit(500).populate('lead', 'name phone company').populate(...EMP_POP));
  }));
  r.post('/followups/:id/done', wrap(async (req, res) => {
    const f = isId(req.params.id) && await FollowUp.findByIdAndUpdate(req.params.id, { done: true }, { new: true });
    return f ? res.json(f) : res.status(404).json({ error: 'Follow-up not found' });
  }));

  // ------------------------------------------------------------ dashboard numbers
  r.get('/stats', wrap(async (req, res) => {
    const byOutcome = Object.fromEntries((await Call.aggregate([{ $group: { _id: '$outcome', n: { $sum: 1 } } }])).map((x) => [x._id || 'in_progress', x.n]));
    const ended = await Call.countDocuments({ status: 'ended' });
    const noConv = ['no_answer', 'busy', 'voicemail', 'failed'].reduce((s, k) => s + (byOutcome[k] || 0), 0);
    const connected = Math.max(0, ended - noConv);
    const booked = byOutcome.appointment_booked || 0;
    const [agg] = await Call.aggregate([{ $group: { _id: null, cost: { $sum: '$costUsd' }, dur: { $avg: '$durationSec' }, total: { $sum: 1 } } }]);
    const stages = Object.fromEntries((await Lead.aggregate([{ $group: { _id: '$stage', n: { $sum: 1 } } }])).map((x) => [x._id, x.n]));
    res.json({
      totalCalls: agg?.total || 0,
      connectedCalls: connected,
      connectRate: ended ? +(connected / ended * 100).toFixed(1) : 0,
      appointments: booked,
      conversionRate: connected ? +(booked / connected * 100).toFixed(1) : 0,
      avgDurationSec: Math.round(agg?.dur || 0),
      totalCostUsd: +(agg?.cost || 0).toFixed(2),
      byOutcome,
      leadsByStage: stages,
    });
  }));

  // errors -> JSON
  r.use((err, req, res, _next) => {
    const status = err.status || (err.name === 'ValidationError' ? 422 : 500);
    if (status >= 500) console.error('[ai-calling]', err);
    res.status(status).json({ error: err.message });
  });
  return r;
}

async function addLeads(camp, leadIds) {
  let added = 0;
  for (const id of leadIds) {
    if (!isId(id) || !(await Lead.exists({ _id: id }))) continue;
    const r = await CampaignLead.updateOne({ campaign: camp._id, lead: id }, { $setOnInsert: { campaign: camp._id, lead: id } }, { upsert: true });
    added += r.upsertedCount || 0;
  }
  return added;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = { createAiCallingRouter };
