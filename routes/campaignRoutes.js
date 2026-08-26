const express = require('express');
const router = express.Router();
const multer = require('multer');

const ctrl = require('../controllers/campaignController');
const { permissionMiddleware } = require('../middlewares/auth');

// In-memory storage — files are forwarded straight to Pinnacle's Upload
// Media API, never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matches typical WhatsApp image limits
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed.'), false);
    cb(null, true);
  },
});

// NEW — separate multer instance for uploading a recipient list
// (CSV/Excel), distinct from the image-only one above.
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(csv|xlsx|xls)$/i;
    if (!allowedExt.test(file.originalname)) return cb(new Error('Only CSV or Excel files are allowed.'), false);
    cb(null, true);
  },
});

// Templates
router.get('/templates',                  permissionMiddleware(['viewCampaign']),   ctrl.listTemplates);
router.get('/templates/approved',         permissionMiddleware(['viewCampaign']),   ctrl.listApprovedTemplates);
router.post('/templates',                 permissionMiddleware(['createCampaign']), ctrl.createTemplate);
router.put('/templates/:id',              permissionMiddleware(['updateCampaign']), ctrl.updateTemplate);
router.delete('/templates/:id',           permissionMiddleware(['deleteCampaign']), ctrl.deleteTemplate);
router.post('/templates/:id/submit',      permissionMiddleware(['createCampaign']), ctrl.submitTemplate);
router.post('/templates/:id/sync-status', permissionMiddleware(['viewCampaign']),   ctrl.syncTemplateStatus);

// NEW — image upload for a template's session images (1–5 per template)
router.post('/templates/upload-image', permissionMiddleware(['createCampaign']), upload.single('image'), ctrl.uploadTemplateImage);

// Sending
router.post('/send', permissionMiddleware(['sendCampaign']), ctrl.sendCampaign);
router.get('/logs',  permissionMiddleware(['viewCampaign']), ctrl.listCampaignLogs);

// NEW — product-wise customer search (searches via linked Leads' product name)
router.get('/customers-by-product', permissionMiddleware(['viewCampaign']), ctrl.searchCustomersByProduct);

// NEW — upload a CSV/Excel of phone numbers, then send directly to them
router.post('/parse-recipient-file', permissionMiddleware(['sendCampaign']), uploadFile.single('file'), ctrl.parseUploadedRecipientFile);
router.post('/send-to-numbers', permissionMiddleware(['sendCampaign']), ctrl.sendCampaignToNumbers);

// Replies — raw inbound messages/taps
router.get('/replies', permissionMiddleware(['viewCampaign']), ctrl.listReplies);
router.get('/replies/customers', permissionMiddleware(['viewCampaign']), ctrl.listReplyCustomers);

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