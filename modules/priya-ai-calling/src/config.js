// All settings come from environment variables (.env)
require('dotenv').config();

const bool = (name, def) => String(process.env[name] ?? def).trim().toLowerCase() in { true: 1, '1': 1, yes: 1, on: 1 };
const int = (name, def) => parseInt(process.env[name] ?? def, 10);

module.exports = {
  PORT: int('PORT', 4000),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/daccess_crm',

  // Secret token Bolna sends back in the webhook URL (?token=...)
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'change-me',
  // Protects the AI-calling API (header X-API-Key). Empty = off (use your CRM's own auth middleware instead)
  CRM_API_KEY: process.env.CRM_API_KEY || '',

  // Bolna
  BOLNA_API_KEY: process.env.BOLNA_API_KEY || '',
  BOLNA_AGENT_ID: process.env.BOLNA_AGENT_ID || '',
  BOLNA_BASE_URL: (process.env.BOLNA_BASE_URL || 'https://api.bolna.ai').replace(/\/$/, ''),
  BOLNA_FROM_NUMBER: process.env.BOLNA_FROM_NUMBER || '',
  BOLNA_COST_IN_CENTS: bool('BOLNA_COST_IN_CENTS', true),
  ENFORCE_BOLNA_IPS: bool('ENFORCE_BOLNA_IPS', false),
  BOLNA_WEBHOOK_IPS: (process.env.BOLNA_WEBHOOK_IPS || '13.203.39.153,13.126.9.249,13.202.133.53')
    .split(',').map((s) => s.trim()).filter(Boolean),
  DRY_RUN: bool('DRY_RUN', true), // true = no real calls

  // Compliance (India)
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  CALL_WINDOW_START: int('CALL_WINDOW_START', 10),
  CALL_WINDOW_END: int('CALL_WINDOW_END', 19),
  NO_CALL_ON_SUNDAY: bool('NO_CALL_ON_SUNDAY', true),
  REQUIRE_CONSENT: bool('REQUIRE_CONSENT', true),

  // Default employee created on first start if the team list is empty (Tripti forwards calls to this person)
  DEFAULT_EMPLOYEE_NAME: process.env.DEFAULT_EMPLOYEE_NAME || '',
  DEFAULT_EMPLOYEE_PHONE: process.env.DEFAULT_EMPLOYEE_PHONE || '',
  DEFAULT_EMPLOYEE_ROLE: process.env.DEFAULT_EMPLOYEE_ROLE || 'sales',

  // Dialer
  MAX_ATTEMPTS: int('MAX_ATTEMPTS', 3),
  RETRY_AFTER_MINUTES: int('RETRY_AFTER_MINUTES', 240),
  MAX_CONCURRENT_CALLS: int('MAX_CONCURRENT_CALLS', 3),
  WORKER_INTERVAL_SECONDS: int('WORKER_INTERVAL_SECONDS', 30),
  ENABLE_WORKER: bool('ENABLE_WORKER', true),

  // ---------- Marketing Master safety switches ----------
  // Which lead SOURCEs Tripti may call. Today: Direct only. Later: Direct,IndiaMart,TradeIndia  (or ALL)
  AI_CALL_ALLOWED_SOURCES: list('AI_CALL_ALLOWED_SOURCES', 'Direct'),
  // Testing lock: if set, ONLY these mobile numbers are ever called (comma separated). Empty = no lock.
  AI_CALL_TEST_NUMBERS: list('AI_CALL_TEST_NUMBERS', ''),
  // Only leads of these CRM company ids (empty = any company)
  AI_CALL_COMPANY_IDS: list('AI_CALL_COMPANY_IDS', ''),
  // Queue new Marketing leads for an automatic Tripti call (respects hours, retries, sources, test lock)
  AUTO_CALL_NEW_LEADS: bool('AUTO_CALL_NEW_LEADS', false),
  AUTO_CALL_CAMPAIGN_NAME: process.env.AUTO_CALL_CAMPAIGN_NAME || 'Marketing Master Auto-Call',
};

function list(name, def) {
  return String(process.env[name] ?? def).split(',').map((s) => s.trim()).filter(Boolean);
}
