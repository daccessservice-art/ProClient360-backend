const express = require('express');
const router = express.Router();

const locationController = require('../controllers/locationController');
const { permissionMiddleware } = require('../middlewares/auth');

// ---------- Service Engineer (mobile app) ----------
// Only designations with "My Service" permission can send location
router.post('/duty/start', permissionMiddleware(['viewMyService']), locationController.startDuty);
router.post('/duty/end', permissionMiddleware(['viewMyService']), locationController.endDuty);
router.get('/duty/status', permissionMiddleware(['viewMyService']), locationController.dutyStatus);
router.post('/', permissionMiddleware(['viewMyService']), locationController.savePoints);

// ---------- Manager (web: Service Master → Live Location) ----------
router.get('/live', permissionMiddleware(['viewService']), locationController.liveLocations);
router.get('/engineers', permissionMiddleware(['viewService']), locationController.trackedEngineers);
router.get('/history/:employeeId', permissionMiddleware(['viewService']), locationController.history);

module.exports = router;