const express = require('express');
const router = express.Router();

const reportController = require('../controllers/reportController');
const { isLoggedIn } = require('../middlewares/auth');

// Task status report — visibility enforced inside the controller
// (company-scoped, non-permission-holders only see their own tasks).
router.get('/task-status', isLoggedIn, reportController.generateTaskStatusReport);

// ✅ NEW — Employee growth/performance report. Aggregates across ALL
// employees, so access is gated INSIDE the controller: the company account
// is always allowed, an employee needs the 'viewTaskSheet' permission, and
// everyone else gets a 403. (Not using permissionMiddleware here since I
// haven't seen its implementation and don't want to risk it treating the
// company account differently than the rest of your app does — check
// middlewares/auth.js and add it back here if it's safe to.)
router.get('/employee-growth', isLoggedIn, reportController.generateEmployeeGrowthReport);

// ✅ NEW — every project, with real task-based completion % alongside the
// manually-set project %. Visibility scoped inside the controller.
router.get('/project-progress', isLoggedIn, reportController.generateProjectProgressReport);

module.exports = router;