const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/campaignController');
const { permissionMiddleware } = require('../middlewares/auth');

// Templates
router.get('/templates',                  permissionMiddleware(['viewCampaign']),   ctrl.listTemplates);
router.get('/templates/approved',         permissionMiddleware(['viewCampaign']),   ctrl.listApprovedTemplates);
router.post('/templates',                 permissionMiddleware(['createCampaign']), ctrl.createTemplate);
router.put('/templates/:id',              permissionMiddleware(['updateCampaign']), ctrl.updateTemplate);
router.delete('/templates/:id',           permissionMiddleware(['deleteCampaign']), ctrl.deleteTemplate);
router.post('/templates/:id/submit',      permissionMiddleware(['createCampaign']), ctrl.submitTemplate);
router.post('/templates/:id/sync-status', permissionMiddleware(['viewCampaign']),   ctrl.syncTemplateStatus);

// Sending
router.post('/send', permissionMiddleware(['sendCampaign']), ctrl.sendCampaign);
router.get('/logs',  permissionMiddleware(['viewCampaign']), ctrl.listCampaignLogs);

// Replies — raw inbound messages/taps
router.get('/replies', permissionMiddleware(['viewCampaign']), ctrl.listReplies);

// Sessions — NEW: structured Q&A from the tap-through questionnaire
router.get('/sessions', permissionMiddleware(['viewCampaign']), ctrl.listSessions);

// Inbound webhook — NOT behind permissionMiddleware, Meta/Pinnacle calls this directly
router.post('/webhook', ctrl.receiveWhatsAppReply);

module.exports = router;

// ── Mount in server.js: ──
// app.use('/api/campaigns', require('./routes/campaignRoutes'));
//
// ── Register with Pinnacle (one-time, see scripts/setPinnacleWebhook.js): ──
// https://<your-domain>/api/campaigns/webhook