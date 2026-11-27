const test = require('node:test');
const assert = require('node:assert');
const { isSourceAllowed, checkEligibility, mapMarketingLead } = require('../src/services/marketingBridge');

const base = { AI_CALL_ALLOWED_SOURCES: ['Direct'], AI_CALL_TEST_NUMBERS: [], AI_CALL_COMPANY_IDS: [] };
const lead = (o = {}) => ({ _id: 'a'.repeat(24), company: 'c1', SOURCE: 'Direct', STATUS: 'Pending', SENDER_MOBILE: '9876543210', SENDER_NAME: 'Ravi', ...o });

test('source switch: Direct only today, IndiaMart/TradeIndia blocked', () => {
  assert.ok(isSourceAllowed('Direct', ['Direct']));
  assert.ok(isSourceAllowed('direct', ['Direct']));
  assert.ok(!isSourceAllowed('IndiaMart', ['Direct']));
  assert.ok(!isSourceAllowed('TradeIndia', ['Direct']));
  assert.ok(isSourceAllowed('TradeIndia', ['Direct', 'IndiaMart', 'TradeIndia']));
  assert.ok(isSourceAllowed('Google', ['ALL']));
});

test('eligibility: IndiaMart lead refused, Direct lead ok', () => {
  assert.equal(checkEligibility(lead({ SOURCE: 'IndiaMart' }), { c: base }).ok, false);
  const r = checkEligibility(lead(), { c: base, companyId: 'c1' });
  assert.equal(r.ok, true); assert.equal(r.phone, '+919876543210');
});

test('eligibility: never calls the forwarding employee number', () => {
  const r = checkEligibility(lead({ SENDER_MOBILE: '8956307471' }), { c: base, employeePhones: ['+918956307471'] });
  assert.equal(r.ok, false); assert.match(r.reason, /team member/);
});

test('eligibility: testing lock allows only listed numbers', () => {
  const c = { ...base, AI_CALL_TEST_NUMBERS: ['+91 98765 43210'] };
  assert.equal(checkEligibility(lead(), { c }).ok, true);
  assert.equal(checkEligibility(lead({ SENDER_MOBILE: '9123456789' }), { c }).ok, false);
});

test('eligibility: company lock, other company, won/lost, bad mobile', () => {
  assert.equal(checkEligibility(lead(), { c: { ...base, AI_CALL_COMPANY_IDS: ['c2'] } }).ok, false);
  assert.equal(checkEligibility(lead(), { c: base, companyId: 'c9' }).ok, false);
  assert.equal(checkEligibility(lead({ STATUS: 'Won' }), { c: base }).ok, false);
  assert.equal(checkEligibility(lead({ SENDER_MOBILE: '12' }), { c: base }).ok, false);
  assert.equal(checkEligibility(null, { c: base }).ok, false);
});

test('maps Marketing lead fields to Tripti variables', () => {
  const m = mapMarketingLead(lead({ SENDER_COMPANY: 'ABC Pvt Ltd', SENDER_CITY: 'Pune', QUERY_PRODUCT_NAME: 'Boom Barrier System', industryType: 'Other', industryTypeOther: 'Warehouse' }));
  assert.deepEqual(
    [m.name, m.company, m.city, m.productInterest, m.placeType, m.source, m.crmLeadId],
    ['Ravi', 'ABC Pvt Ltd', 'Pune', 'Boom Barrier System', 'Warehouse', 'Direct', 'a'.repeat(24)]);
  assert.equal(mapMarketingLead(lead({ SENDER_NAME: '', SENDER_COMPANY: 'XYZ' })).name, 'XYZ');
});
