const express = require('express');
const router = express.Router();
const amcCallLogController = require('../controllers/amcCallLogController');
const { isLoggedIn } = require('../middlewares/auth');

// Fixed paths FIRST (before /:amcId)
router.get('/alert-count', isLoggedIn, amcCallLogController.getAlertCount);
router.post('/summary', isLoggedIn, amcCallLogController.getCallSummary);

router.get('/:amcId', isLoggedIn, amcCallLogController.getCallHistory);
router.post('/:amcId', isLoggedIn, amcCallLogController.logCall);

module.exports = router;