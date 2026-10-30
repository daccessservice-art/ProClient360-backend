const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/landingPageLeadController');
const { permissionMiddleware } = require('../middlewares/auth');

router.get('/stats',      permissionMiddleware(['viewMarketingDashboard']), ctrl.getLandingPageLeadStats);
router.get('/',           permissionMiddleware(['viewMarketingDashboard']), ctrl.getLandingPageLeads);
router.post('/move-bulk', permissionMiddleware(['createLead']),             ctrl.moveBulkToMarketing);
router.post('/:id/move',  permissionMiddleware(['createLead']),             ctrl.moveToMarketing);
router.delete('/:id',     permissionMiddleware(['deleteLead']),             ctrl.deleteLandingPageLead);

module.exports = router;