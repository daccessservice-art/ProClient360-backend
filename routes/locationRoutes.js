const express = require('express');
const router = express.Router();

const locationController = require('../controllers/locationController');
const serviceVisitController = require('../controllers/serviceVisitController'); // ✅ NEW — 100 m site check
const { permissionMiddleware } = require('../middlewares/auth');

// ---------- Service Engineer (mobile app) ----------
// Only designations with "My Service" permission can send location
router.post('/duty/start', permissionMiddleware(['viewMyService']), locationController.startDuty);
router.post('/duty/end', permissionMiddleware(['viewMyService']), locationController.endDuty);
router.get('/duty/status', permissionMiddleware(['viewMyService']), locationController.dutyStatus);
router.post('/', permissionMiddleware(['viewMyService']), locationController.savePoints);

// ✅ NEW — Service visit: Start Work / End Work within 100 m of the site
router.post('/visit/start', permissionMiddleware(['viewMyService']), serviceVisitController.startVisit);
router.post('/visit/check', permissionMiddleware(['viewMyService']), serviceVisitController.checkVisit);
router.post('/visit/end', permissionMiddleware(['viewMyService']), serviceVisitController.endVisit);
router.get('/visit/active', permissionMiddleware(['viewMyService']), serviceVisitController.activeVisit);

// ---------- Manager (web: Service Master → Live Location) ----------
router.get('/live', permissionMiddleware(['viewService']), locationController.liveLocations);
router.get('/engineers', permissionMiddleware(['viewService']), locationController.trackedEngineers);
router.get('/history/:employeeId', permissionMiddleware(['viewService']), locationController.history);
router.get('/visit/service/:serviceId', permissionMiddleware(['viewService']), serviceVisitController.serviceVisits); // ✅ NEW

module.exports = router;