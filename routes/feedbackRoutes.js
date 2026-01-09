const express = require('express');
const router = express.Router();

const feedbackController = require('../controllers/feedbackController');
const { permissionMiddleware } = require('../middlewares/auth');

// Get all feedbacks - requires permission
router.get('/', permissionMiddleware(["viewFeedback"]), feedbackController.showAll);

// Create feedback - no permission middleware (for clients without login)
router.post('/', feedbackController.create);

// Update feedback - no permission middleware (for clients without login)
router.put('/', feedbackController.update);

// Get services that need feedback - requires permission
router.get('/remaningFeedbacks', permissionMiddleware(["viewFeedback"]), feedbackController.feedback);

module.exports = router;