// Plug Tripti (Bolna AI calling) into your existing Express CRM:
//
//   const { mountAiCalling, events } = require('./modules/priya-ai-calling/src');
//   mountAiCalling(app, { auth: isLoggedIn, marketingLeadModel: require('./models/leadsModel') });
//   events.on('appointment.created', ({ appointment, lead }) => { /* notify sales, update your Lead */ });
//
const path = require('path');
const express = require('express');
const cfg = require('./config');
const { createAiCallingRouter } = require('./routes/aiCalling');
const { createBolnaWebhookRouter } = require('./routes/bolnaWebhook');
const { createMarketingRouter } = require('./routes/marketing');
const marketingBridge = require('./services/marketingBridge');
const { startDialer, runDialerOnce } = require('./services/dialer');
const { events } = require('./services/callService');
const models = require('./models');

function mountAiCalling(app, { auth = (req, res, next) => next(), basePath = '/api/ai-calling', dashboardPath = '/ai-calling', startWorker = cfg.ENABLE_WORKER, marketingLeadModel = null } = {}) {
  app.use(createBolnaWebhookRouter()); // public (token protected) -> /webhooks/bolna
  if (marketingLeadModel) {
    marketingBridge.setMarketingLeadModel(marketingLeadModel);
    app.use(`${basePath}/marketing`, auth, createMarketingRouter()); // Marketing Master popup API
  }
  app.use(basePath, auth, createAiCallingRouter()); // your CRM's login protects this
  if (dashboardPath && require('fs').existsSync(path.join(__dirname, 'public'))) app.use(dashboardPath, auth, express.static(path.join(__dirname, 'public')));
  const timer = startWorker ? startDialer() : null;
  seedDefaultEmployee().catch((e) => console.error('[ai-calling] could not create default employee:', e.message));
  return { timer };
}

// Creates the default employee (from .env) once, if the team list is empty
async function seedDefaultEmployee() {
  if (!cfg.DEFAULT_EMPLOYEE_NAME || !cfg.DEFAULT_EMPLOYEE_PHONE) return;
  if (await models.Employee.exists({})) return;
  const { normalizePhone } = require('./services/compliance');
  await models.Employee.create({ name: cfg.DEFAULT_EMPLOYEE_NAME, phone: normalizePhone(cfg.DEFAULT_EMPLOYEE_PHONE), role: cfg.DEFAULT_EMPLOYEE_ROLE });
  console.log(`[ai-calling] default employee created: ${cfg.DEFAULT_EMPLOYEE_NAME}`);
}

module.exports = {
  mountAiCalling, events, models, runDialerOnce, config: cfg,
  onMarketingLeadCreated: marketingBridge.onMarketingLeadCreated, // call from your createLead controller
};
