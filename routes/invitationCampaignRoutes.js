// routes/invitationCampaignRoutes.js
// INVITATION CAMPAIGN (DAccess) — mounted at /api/invitation-campaigns
// Uses the same permissions as WhatsApp Campaigns (no designation changes needed).
const express = require('express');
const router = express.Router();
const multer = require('multer');

const ctrl = require('../controllers/invitationCampaignController');
const { permissionMiddleware } = require('../middlewares/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png)$/.test(file.mimetype)) return cb(new Error('Only JPG or PNG images are allowed.'), false);
    cb(null, true);
  },
});

router.get('/templates',                  permissionMiddleware(['viewCampaign']),   ctrl.listTemplates);
router.post('/templates',                 permissionMiddleware(['createCampaign']), ctrl.createTemplate);
router.put('/templates/:id',              permissionMiddleware(['updateCampaign']), ctrl.updateTemplate);
router.delete('/templates/:id',           permissionMiddleware(['deleteCampaign']), ctrl.deleteTemplate);
router.post('/templates/:id/submit',      permissionMiddleware(['createCampaign']), ctrl.submitTemplate);
router.post('/templates/:id/sync-status', permissionMiddleware(['viewCampaign']),   ctrl.syncTemplateStatus);
router.post('/upload-image',              permissionMiddleware(['createCampaign']), upload.single('image'), ctrl.uploadImage);

router.post('/send',     permissionMiddleware(['sendCampaign']), ctrl.sendInvitation);
router.get('/logs',      permissionMiddleware(['viewCampaign']), ctrl.listLogs);
router.get('/responses', permissionMiddleware(['viewCampaign']), ctrl.listResponses);

// No separate webhook: button taps arrive on the existing DAccess webhook
// (/api/campaigns/webhook), which forwards them to handleInvitationButtonTap().

module.exports = router;