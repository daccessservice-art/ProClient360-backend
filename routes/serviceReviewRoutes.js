const express = require('express');
const router  = express.Router();

const serviceReviewController = require('../controllers/serviceReviewController');
const { permissionMiddleware } = require('../middlewares/auth');

// GET /api/serviceReview/all?month=3&year=2025  — for leaderboard  ← MUST be before /:id style routes
router.get('/all', permissionMiddleware(['viewService']), serviceReviewController.showAll);

// GET /api/serviceReview?engineerId=xxx
router.get('/',    permissionMiddleware(['viewService']),   serviceReviewController.showByEngineer);

// POST /api/serviceReview  — create or overwrite
router.post('/',   permissionMiddleware(['updateService']), serviceReviewController.upsert);

module.exports = router;