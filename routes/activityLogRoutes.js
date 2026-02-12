const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const { permissionMiddleware } = require('../middlewares/auth');

console.log('📋 Registering Activity Log Routes...');

// Get all activity logs with filtering
router.get('/all', permissionMiddleware(['viewActivityLog']), activityLogController.getAllActivityLogs);

// Get annual activity report
router.get('/annual', permissionMiddleware(['viewAnnualReport']), activityLogController.getAnnualActivityReport);

// Get user activity report
router.get('/user-report', permissionMiddleware(['viewActivityLog']), activityLogController.getUserActivityReport);

// Export activity logs
router.get('/export', permissionMiddleware(['viewActivityLog']), activityLogController.exportActivityLogs);

// Get activity logs for a specific entity
router.get('/:entityType/:entityId', permissionMiddleware(['viewActivityLog']), activityLogController.getEntityActivityLogs);

console.log('✅ Activity Log routes registered successfully');

module.exports = router;