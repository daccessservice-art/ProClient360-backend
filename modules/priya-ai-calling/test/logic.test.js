// Tests for the call-result logic (no database needed): node --test
process.env.DRY_RUN = 'true';
process.env.TIMEZONE = 'Asia/Kolkata';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, withinCallingHours, canCall } = require('../src/services/compliance');
const { buildUserData, startOutboundCall } = require('../src/services/bolnaClient');
const { planFromExecution, campaignLeadAfterCall, flatten, outcomeFromExtracted } = require('../src/services/resultMapper');
const cfg = require('../src/config');

const NOON_THU = new Date('2026-11-26T06:30:00Z'); // 12:00 IST Thursday
const NIGHT = new Date('2026-11-26T15:30:00Z'); // 21:00 IST
const SUNDAY = new Date('2026-11-29T06:30:00Z');

const final = (over = {}) => ({
  id: 'exec-1', status: 'completed', conversation_duration: 142, total_cost: 8.5,
  transcript: 'assistant: Namaste...\nuser: Haan boliye', summary: 'Needs 8 CCTV cameras; visit Sat 11 AM',
  telephony_data: { duration: '142', recording_url: 'https://api.bolna.ai/recordings/call/exec-1', to_number: '+919876543210', from_number: '+918035739222', hangup_reason: 'call_ended', call_type: 'outbound' },
  extracted_data: {}, ...over,
});

test('phone normalisation', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('+91-98765-43210'), '+919876543210');
  assert.equal(normalizePhone('09876543210'), '+919876543210');
  assert.throws(() => normalizePhone('12345'));
});

test('calling hours and permission', () => {
  assert.ok(withinCallingHours(NOON_THU));
  assert.ok(!withinCallingHours(NIGHT));
  assert.ok(!withinCallingHours(SUNDAY));
  assert.match(canCall({ consent: false, stage: 'new' }, { now: NOON_THU }).reason, /consent/);
  assert.match(canCall({ consent: true, dnd: true }, { now: NOON_THU }).reason, /Do-Not-Call/);
  assert.match(canCall({ consent: true, stage: 'new' }, { now: NIGHT }).reason, /Outside calling hours/);
  assert.ok(canCall({ consent: true, stage: 'new' }, { now: NOON_THU }).ok);
});

test('variables sent to Priya', async () => {
  const ud = buildUserData({ name: 'Rahul Sharma', company: 'Acme Pvt Ltd', city: 'Pune', source: 'IndiaMART' });
  assert.equal(ud.lead_name, 'Rahul');
  assert.equal(ud.company, 'Acme Pvt Ltd');
  assert.equal(ud.lead_source, 'IndiaMART');
  assert.equal(ud.user_name, 'Rahul Sharma');
  assert.equal(ud.user_city, 'Pune');
  assert.equal(ud.company_name, 'Acme Pvt Ltd');
  assert.ok(!('place_type' in ud));
  const id = await startOutboundCall({ name: 'Rahul', phone: '+919876543210' });
  assert.match(id, /^dryrun-/);
});

test('flatten handles {value, confidence} and empty values', () => {
  assert.deepEqual(flatten({ Call_Outcome: { value: 'interested', confidence: 0.9 }, city: 'N/A', x: null }), { call_outcome: 'interested' });
  assert.deepEqual(flatten('garbage'), {});
});

test('outcome detection from free text', () => {
  assert.equal(outcomeFromExtracted({ call_outcome: 'Not Interested' }), 'not_interested');
  assert.equal(outcomeFromExtracted({ call_outcome: 'callback requested' }), 'callback_requested');
  assert.equal(outcomeFromExtracted({ call_outcome: 'Site visit booked' }), 'appointment_booked');
  assert.equal(outcomeFromExtracted({ call_outcome: 'interested', do_not_call: 'yes' }), 'do_not_call');
  assert.equal(outcomeFromExtracted({ site_visit_datetime: 'Sat 11 AM' }), 'appointment_booked');
  assert.equal(outcomeFromExtracted({}), null);
});

test('site visit booked -> appointment, lead updates, WhatsApp follow-up', () => {
  const plan = planFromExecution(final({
    extracted_data: {
      call_outcome: { value: 'appointment_booked', confidence: 0.93 }, site_visit_datetime: 'Saturday 29 Nov, 11 AM',
      site_visit_address: 'Office 5, Revati Arcade, Baner, Pune', requirement: 'CCTV', quantity: '8 cameras',
      place_type: 'office', timeline: 'within 2 weeks', interest_level: 'hot', brochure_requested: 'yes',
    },
  }), { name: 'Rahul Sharma', stage: 'contacted' });
  assert.ok(plan.final);
  assert.equal(plan.call.outcome, 'appointment_booked');
  assert.equal(plan.call.durationSec, 142);
  assert.equal(plan.call.recordingUrl, 'https://api.bolna.ai/recordings/call/exec-1');
  assert.equal(plan.lead.stage, 'appointment');
  assert.equal(plan.lead.placeType, 'office');
  assert.equal(plan.lead.productInterest, 'CCTV 8 cameras');
  assert.match(plan.lead.appendNote, /interestLevel: hot/);
  assert.equal(plan.appointments.length, 1);
  assert.equal(plan.appointments[0].scheduledFor, 'Saturday 29 Nov, 11 AM');
  assert.match(plan.appointments[0].address, /Baner/);
  assert.deepEqual(plan.followUps.map((f) => f.kind), ['whatsapp']);
});

test('callback, not interested, do-not-call', () => {
  const cb = planFromExecution(final({ extracted_data: { call_outcome: 'callback requested', callback_time: 'tomorrow 5 PM' } }), { stage: 'contacted', name: 'Amit' });
  assert.equal(cb.lead.stage, 'callback');
  assert.equal(cb.followUps[0].dueAt, 'tomorrow 5 PM');

  const ni = planFromExecution(final({ extracted_data: { call_outcome: 'not_interested' } }), { stage: 'contacted', name: 'Sneha' });
  assert.equal(ni.lead.stage, 'not_interested');
  assert.equal(ni.appointments.length + ni.followUps.length, 0);

  const dnd = planFromExecution(final({ extracted_data: { do_not_call: true } }), { stage: 'appointment', name: 'Vikas' });
  assert.equal(dnd.call.outcome, 'do_not_call');
  assert.equal(dnd.lead.dnd, true);
  assert.equal(dnd.lead.stage, 'lost'); // DND overrides even an appointment
});

test('lead is never moved backwards from appointment by a later "interested" call', () => {
  const p = planFromExecution(final({ extracted_data: { call_outcome: 'interested' } }), { stage: 'appointment', name: 'X' });
  assert.equal(p.lead.stage, undefined);
});

test('no answer / busy / failed / voicemail', () => {
  assert.equal(planFromExecution(final({ status: 'no-answer', transcript: '' }), { stage: 'contacted' }).call.outcome, 'no_answer');
  assert.equal(planFromExecution(final({ status: 'busy' }), null).call.outcome, 'busy');
  assert.equal(planFromExecution(final({ status: 'balance-low' }), null).call.outcome, 'failed');
  const vm = planFromExecution(final({ telephony_data: { hangup_reason: 'voicemail_detected' } }), { stage: 'contacted' });
  assert.equal(vm.call.outcome, 'voicemail');
});

test('progress events are not final', () => {
  for (const s of ['queued', 'ringing', 'in-progress', 'call-disconnected']) {
    const p = planFromExecution({ id: 'e', status: s }, null);
    assert.equal(p.final, false);
    assert.equal(p.call.status, s);
  }
});

test('campaign retries', () => {
  const c = { MAX_ATTEMPTS: 3, RETRY_AFTER_MINUTES: 240 };
  const r1 = campaignLeadAfterCall({ attempts: 1 }, 'no_answer', c, NOON_THU);
  assert.equal(r1.status, 'pending');
  assert.equal(r1.nextAttemptAt.getTime() - NOON_THU.getTime(), 240 * 60000);
  assert.equal(campaignLeadAfterCall({ attempts: 3 }, 'busy', c).status, 'failed');
  assert.equal(campaignLeadAfterCall({ attempts: 1 }, 'interested', c).status, 'done');
});

test('config defaults are safe', () => {
  assert.equal(cfg.DRY_RUN, true);
  assert.equal(cfg.CALL_WINDOW_START, 10);
  assert.equal(cfg.CALL_WINDOW_END, 19);
});

// Real shape seen on Priya's call d4510476 (27 Nov 2026): grouped by category, answers in "subjective"
const leaf = (subjective, confidence = 0.9) => ({ objective: null, confidence, subjective, validation: null, confidence_label: 'High', reasoning_objective: null, reasoning_subjective: '...' });

test('real Bolna shape: no-response call', () => {
  const ex = final({
    summary: undefined,
    extracted_data: {
      'Lead Details': {
        city: leaf('Pune'), quantity: leaf(null), timeline: leaf(null), place_type: leaf(null), do_not_call: leaf(null),
        requirement: leaf(null), call_outcome: leaf('other', 0.8), callback_time: leaf(null), customer_name: leaf(null),
        interest_level: leaf('cold'), brochure_requested: leaf(null), site_visit_address: leaf(null), site_visit_datetime: leaf(null),
      },
      General: { 'Call Summary': { subjective: 'The user responded minimally with hello.' } },
    },
  });
  assert.deepEqual(flatten(ex.extracted_data), { city: 'Pune', call_outcome: 'other', interest_level: 'cold', call_summary: 'The user responded minimally with hello.' });
  const p = planFromExecution(ex, { stage: 'contacted', name: 'Test' });
  assert.equal(p.call.outcome, 'other');
  assert.equal(p.call.summary, 'The user responded minimally with hello.');
  assert.ok(!('call_summary' in p.call.extracted));
  assert.equal(p.appointments.length + p.followUps.length, 0);
});

test('real Bolna shape: site visit booked', () => {
  const p = planFromExecution(final({
    extracted_data: {
      'Lead Details': {
        call_outcome: leaf('appointment_booked'), site_visit_datetime: leaf('Saturday 11 AM'),
        site_visit_address: leaf('Office 5, Revati Arcade, Baner'), requirement: leaf('CCTV'), quantity: leaf('8 cameras'),
        place_type: leaf('office'), brochure_requested: leaf('yes'), do_not_call: leaf('no'),
      },
    },
  }), { stage: 'contacted', name: 'Rahul' });
  assert.equal(p.call.outcome, 'appointment_booked');
  assert.equal(p.lead.stage, 'appointment');
  assert.equal(p.appointments[0].address, 'Office 5, Revati Arcade, Baner');
  assert.deepEqual(p.followUps.map((f) => f.kind), ['whatsapp']);
});

// ---------------- employee assignment + call forwarding
const { chooseEmployee } = require('../src/services/assignment');

test('assignment: area match first, then round-robin, skips inactive and other roles', () => {
  const emps = [
    { _id: 'a', name: 'Amit', role: 'sales', areas: ['Baner', 'Aundh'], active: true, lastAssignedAt: new Date('2026-11-27T05:00:00Z') },
    { _id: 'b', name: 'Bhavna', role: 'sales', areas: ['Hadapsar'], active: true, lastAssignedAt: new Date('2026-11-26T05:00:00Z') },
    { _id: 'c', name: 'Chetan', role: 'sales', areas: [], active: true },
    { _id: 'd', name: 'Disha', role: 'marketing', areas: ['Baner'], active: true },
    { _id: 'e', name: 'Eknath', role: 'sales', areas: ['Baner'], active: false },
  ];
  assert.equal(chooseEmployee(emps, { role: 'sales', city: 'Baner, Pune' }).name, 'Amit'); // covers Baner
  assert.equal(chooseEmployee(emps, { role: 'sales', city: 'Nashik' }).name, 'Chetan'); // never assigned yet -> first
  assert.equal(chooseEmployee(emps, { role: 'marketing' }).name, 'Disha');
  assert.equal(chooseEmployee(emps, { role: 'service' }), null);
});

test('assigned employee number is sent to Tripti for live transfer', () => {
  const ud = buildUserData({ name: 'Rahul Sharma', phone: '+919876543210' }, { name: 'Amit Patil', phone: '+919811112222' });
  assert.equal(ud.transfer_number, '+919811112222');
  assert.equal(ud.sales_executive_name, 'Amit Patil');
  assert.ok(!('transfer_number' in buildUserData({ name: 'X' })));
});

test('transferred call is marked transferred', () => {
  const p = planFromExecution(final({ telephony_data: { hangup_reason: 'call_transferred' }, extracted_data: { call_outcome: 'interested' } }), { stage: 'contacted', name: 'R' });
  assert.equal(p.call.outcome, 'transferred');
  assert.equal(p.lead.stage, 'interested');
  const p2 = planFromExecution(final({ extracted_data: { call_outcome: 'transferred' } }), { stage: 'contacted', name: 'R' });
  assert.equal(p2.call.outcome, 'transferred');
});

test('one person covering sales and marketing: chooseEmployee with any role', () => {
  const emps = [{ _id: 'v', name: 'Vaishnavi Sonawane', role: 'sales', areas: [], active: true }];
  assert.equal(chooseEmployee(emps, { role: 'marketing' }), null);
  assert.equal(chooseEmployee(emps, { role: null }).name, 'Vaishnavi Sonawane'); // fallback used by ensureAssigned
});
