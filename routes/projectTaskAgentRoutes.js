const express = require('express');
const router = express.Router();

const projectTaskAgentController = require('../controllers/projectTaskAgentController');
const { isLoggedIn } = require('../middlewares/auth');
const { chatRateLimiter, writeRateLimiter } = require('../middlewares/agentRateLimiter');

router.get('/suggest-assignees', isLoggedIn, projectTaskAgentController.suggestAssignees);
router.get('/suggest-tester', isLoggedIn, projectTaskAgentController.suggestTester);
router.get('/my-focus', isLoggedIn, projectTaskAgentController.suggestNextFocus);

// ✅ NEW — rate limited: 30 chat messages per 10 min per user (protects
// your Anthropic API bill from runaway/abusive usage at scale)
router.post('/chat', isLoggedIn, chatRateLimiter, projectTaskAgentController.chatWithAgent);

// ✅ NEW — rate limited: 60 writes per 10 min per user (protects against
// runaway write loops even though these calls are free)
router.put('/apply-update', isLoggedIn, writeRateLimiter, projectTaskAgentController.applyAgentUpdate);
router.put('/apply-action-log', isLoggedIn, writeRateLimiter, projectTaskAgentController.applyAgentActionLog);

// Accountability: see everything the Agent has changed. Visibility is
// scoped inside the controller (own changes only, unless the caller has
// viewTaskSheet permission or is the company account).
router.get('/audit-log', isLoggedIn, projectTaskAgentController.getAgentAuditLog);

module.exports = router;