// Talks to Bolna: place outbound calls and fetch call (execution) results.
// Docs: https://www.bolna.ai/docs/api-reference/calls/make  and  /executions/get_execution
// Tripti's prompt, voice, language and extractions are configured in the Bolna dashboard.
const crypto = require('crypto');
const cfg = require('../config');

class BolnaError extends Error {
  constructor(msg) { super(msg); this.status = 502; }
}

// Variables for Tripti's prompt / welcome message, e.g. {lead_name}.
// Several aliases are sent so it works whatever names Auto Build used. Keep the ones your prompt uses.
function buildUserData(lead, employee = null) {
  const first = (lead.name || '').trim().split(/\s+/)[0] || '';
  // Tripti's script (Bolna) uses: {lead_name} in the welcome message, {user_name}, {company_name}, {user_city}, {place_type}
  const data = {
    lead_name: first, user_name: lead.name, name: first, customer_name: first, full_name: lead.name,
    company: lead.company, company_name: lead.company,
    user_city: lead.city, city: lead.city, location: lead.city,
    place_type: lead.placeType, type_of_place: lead.placeType,
    product_interest: lead.productInterest, lead_source: lead.source,
    // Live call forwarding: Tripti transfers to the lead's assigned employee
    transfer_number: employee?.phone, sales_executive_name: employee?.name, sales_executive_phone: employee?.phone,
  };
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v));
}

const headers = () => ({ Authorization: `Bearer ${cfg.BOLNA_API_KEY}`, 'Content-Type': 'application/json' });

async function startOutboundCall(lead, employee = null) {
  const payload = {
    agent_id: cfg.BOLNA_AGENT_ID,
    recipient_phone_number: lead.phone,
    user_data: buildUserData(lead, employee),
  };
  if (cfg.BOLNA_FROM_NUMBER) payload.from_phone_number = cfg.BOLNA_FROM_NUMBER;

  if (cfg.DRY_RUN) {
    const id = `dryrun-${crypto.randomUUID()}`;
    console.warn(`[bolna] DRY_RUN: not dialing ${lead.phone}. Would POST /call`, JSON.stringify(payload));
    return id;
  }
  if (!cfg.BOLNA_API_KEY || !cfg.BOLNA_AGENT_ID) throw new BolnaError('BOLNA_API_KEY and BOLNA_AGENT_ID must be set (or DRY_RUN=true)');

  const res = await fetch(`${cfg.BOLNA_BASE_URL}/call`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new BolnaError(`Number still activating, retry after ${body.retry_after_seconds}s`);
  if (!res.ok) throw new BolnaError(`Bolna error ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body.execution_id;
}

async function getExecution(executionId) {
  if (cfg.DRY_RUN || String(executionId).startsWith('dryrun-')) throw new BolnaError('Cannot fetch a dry-run call from Bolna');
  const res = await fetch(`${cfg.BOLNA_BASE_URL}/executions/${executionId}`, { headers: headers(), signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new BolnaError(`Bolna error ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

module.exports = { buildUserData, startOutboundCall, getExecution, BolnaError };
