// routes/enteroCampaignRoutes.js
// ENTERO SYSTEMS — separate WhatsApp campaign API, mounted at /api/entero-campaigns
const express = require('express');
const router = express.Router();
const multer = require('multer');

const ctrl = require('../controllers/enteroCampaignController');
const { permissionMiddleware } = require('../middlewares/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed.'), false);
    cb(null, true);
  },
});

const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.originalname)) return cb(new Error('Only CSV or Excel files are allowed.'), false);
    cb(null, true);
  },
});

// Templates
router.get('/templates',                  permissionMiddleware(['viewEnteroCampaign']),   ctrl.listTemplates);
router.get('/templates/approved',         permissionMiddleware(['viewEnteroCampaign']),   ctrl.listApprovedTemplates);
router.post('/templates',                 permissionMiddleware(['createEnteroCampaign']), ctrl.createTemplate);
router.post('/templates/upload-image',    permissionMiddleware(['createEnteroCampaign']), upload.single('image'), ctrl.uploadTemplateImage);
router.put('/templates/:id',              permissionMiddleware(['updateEnteroCampaign']), ctrl.updateTemplate);
router.delete('/templates/:id',           permissionMiddleware(['deleteEnteroCampaign']), ctrl.deleteTemplate);
router.post('/templates/:id/submit',      permissionMiddleware(['createEnteroCampaign']), ctrl.submitTemplate);
router.post('/templates/:id/sync-status', permissionMiddleware(['viewEnteroCampaign']),   ctrl.syncTemplateStatus);

// Entero's own customers (for the Send popup)
router.get('/customers', permissionMiddleware(['viewEnteroCampaign']), ctrl.listEnteroCustomers);

// Sending
router.post('/send', permissionMiddleware(['sendEnteroCampaign']), ctrl.sendCampaign);
router.get('/logs',  permissionMiddleware(['viewEnteroCampaign']), ctrl.listCampaignLogs);
router.get('/customers-by-product', permissionMiddleware(['viewEnteroCampaign']), ctrl.searchCustomersByProduct);
router.post('/parse-recipient-file', permissionMiddleware(['sendEnteroCampaign']), uploadFile.single('file'), ctrl.parseUploadedRecipientFile);
router.post('/send-to-numbers', permissionMiddleware(['sendEnteroCampaign']), ctrl.sendCampaignToNumbers);

// Replies / sessions
router.get('/replies',           permissionMiddleware(['viewEnteroCampaign']), ctrl.listReplies);
router.get('/replies/customers', permissionMiddleware(['viewEnteroCampaign']), ctrl.listReplyCustomers);
router.get('/sessions',          permissionMiddleware(['viewEnteroCampaign']), ctrl.listSessions);

// Entero's own inbound webhook — register THIS URL in Entero's Pinnacle panel:
//   https://proclient360.com/api/entero-campaigns/webhook
router.post('/webhook', ctrl.receiveWhatsAppReply);

module.exports = router;