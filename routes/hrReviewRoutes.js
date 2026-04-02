const express = require('express');
const router  = express.Router();

const hrReviewController = require('../controllers/hrReviewController');
const { permissionMiddleware } = require('../middlewares/auth');

// GET /api/hrReview?engineerId=xxx
router.get('/',    permissionMiddleware(['viewEmployee']),    hrReviewController.showByEngineer);

// GET /api/hrReview/all?month=3&year=2025  — for leaderboard
router.get('/all', permissionMiddleware(['viewEmployee']),    hrReviewController.showAll);

// POST /api/hrReview  — create or overwrite
router.post('/',   permissionMiddleware(['updateEmployee']),  hrReviewController.upsert);

module.exports = router;