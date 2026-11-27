// Database side: start calls and apply Bolna results to MongoDB.
// Emits events so your existing CRM can react (update its own lead, notify a salesperson, send WhatsApp...).
const EventEmitter = require('events');
const cfg = require('../config');
const bolna = require('./bolnaClient');
const { canCall, normalizePhone } = require('./compliance');
const { planFromExecution, campaignLeadAfterCall, flatten } = require('./resultMapper');
const { Lead, Call, Appointment, FollowUp, CampaignLead, Campaign, Employee } = require('../models');
const { ensureAssigned } = require('./assignment');

const events = new EventEmitter(); // 'call.started', 'call.finished', 'appointment.created', 'followup.created'

class CallNotAllowed extends Error {
  constructor(msg) { super(msg); this.status = 422; }
}

async function findLeadByPhone(phone) {
  if (!phone) return null;
  let p = phone;
  try { p = normalizePhone(phone); } catch { /* keep raw */ }
  return Lead.findOne({ phone: p });
}

// ---------------------------------------------------------------- outbound
async function startCall(lead, { campaignLead = null, checkHours = true } = {}) {
  const { ok, reason } = canCall(lead, { checkHours });
  if (!ok) throw new CallNotAllowed(reason);

  // Make sure the lead has a sales/marketing employee: Tripti forwards live calls to this person
  let role = 'sales';
  if (campaignLead?.campaign) role = (await Campaign.findById(campaignLead.campaign))?.assignRole || 'sales';
  const employee = await ensureAssigned(lead, { role });

  const call = await Call.create({
    lead: lead._id, direction: 'outbound', phone: lead.phone, status: 'queued',
    campaign: campaignLead?.campaign, campaignLead: campaignLead?._id,
  });
  try {
    call.providerCallId = await bolna.startOutboundCall(lead, employee);
  } catch (err) {
    Object.assign(call, { status: 'failed', outcome: 'failed', endedReason: String(err.message).slice(0, 120) });
    await call.save();
    if (campaignLead) {
      campaignLead.attempts += 1;
      Object.assign(campaignLead, campaignLeadAfterCall(campaignLead, 'failed', cfg));
      await campaignLead.save();
    }
    throw err;
  }
  await call.save();
  if (campaignLead) {
    campaignLead.status = 'calling';
    campaignLead.attempts += 1;
    await campaignLead.save();
  }
  if (lead.stage === 'new') { lead.stage = 'contacted'; await lead.save(); }
  events.emit('call.started', { call, lead, employee });
  return call;
}

// ---------------------------------------------------------------- webhook / sync
async function getOrCreateCall(ex) {
  const execId = ex.id || ex.execution_id;
  let call = execId ? await Call.findOne({ providerCallId: execId }) : null;
  if (call) return call;
  const tel = ex.telephony_data || {};
  const direction = tel.call_type === 'inbound' ? 'inbound' : 'outbound';
  const phone = direction === 'inbound' ? tel.from_number : tel.to_number;
  const lead = await findLeadByPhone(phone);
  call = await Call.create({ providerCallId: execId, lead: lead?._id, direction, phone, status: ex.status || 'in-progress' });
  return call;
}

async function ensureLead(call, extracted) {
  if (call.lead) return Lead.findById(call.lead);
  if (!call.phone) return null;
  let lead = await findLeadByPhone(call.phone);
  if (!lead) {
    let phone = call.phone;
    try { phone = normalizePhone(phone); } catch { /* keep raw */ }
    const flat = flatten(extracted);
    const name = flat.customer_name || flat.name;
    lead = await Lead.create({ name: name ? String(name) : 'Unknown caller', phone, source: 'inbound_call', stage: 'contacted', consent: true });
  }
  call.lead = lead._id;
  return lead;
}

async function handleExecutionEvent(ex) {
  const call = await getOrCreateCall(ex);

  // Duplicate final event -> already processed
  if (call.status === 'ended' && (call.transcript || ex.status !== 'completed')) return call;

  const lead = ex.status === 'completed'
    ? await ensureLead(call, (ex.extracted_data && typeof ex.extracted_data === 'object') ? ex.extracted_data : {})
    : (call.lead ? await Lead.findById(call.lead) : null);
  const plan = planFromExecution(ex, lead);

  if (!plan.final) {
    call.status = plan.call.status;
    if (plan.call.status === 'in-progress' && !call.startedAt) call.startedAt = new Date();
    await call.save();
    return call;
  }

  Object.assign(call, plan.call);
  if (typeof ex.total_cost === 'number') call.costUsd = cfg.BOLNA_COST_IN_CENTS ? +(ex.total_cost / 100).toFixed(4) : ex.total_cost;
  await call.save();

  if (lead && Object.keys(plan.lead).length) {
    const { appendNote, ...fields } = plan.lead;
    Object.assign(lead, fields);
    if (appendNote) lead.notes = [lead.notes, appendNote].filter(Boolean).join('\n');
    await lead.save();
  }
  // Tasks go to the lead's assigned employee (assign one now if a new inbound caller has none)
  const employee = lead ? await ensureAssigned(lead) : null;
  for (const a of plan.appointments) {
    const appt = await Appointment.create({ ...a, lead: lead._id, call: call._id, assignedTo: employee?._id });
    events.emit('appointment.created', { appointment: appt, lead, call, employee });
  }
  for (const f of plan.followUps) {
    const fu = await FollowUp.create({ ...f, lead: lead._id, call: call._id, assignedTo: employee?._id });
    events.emit('followup.created', { followUp: fu, lead, call, employee });
  }
  if (call.campaignLead) {
    const cl = await CampaignLead.findById(call.campaignLead);
    if (cl) { Object.assign(cl, campaignLeadAfterCall(cl, call.outcome, cfg)); await cl.save(); }
  }
  events.emit('call.finished', { call, lead, employee });
  if (call.outcome === 'transferred') events.emit('call.transferred', { call, lead, employee });
  return call;
}

async function syncCall(call) {
  const ex = await bolna.getExecution(call.providerCallId);
  return handleExecutionEvent(ex);
}

module.exports = { events, startCall, handleExecutionEvent, syncCall, findLeadByPhone, CallNotAllowed };
