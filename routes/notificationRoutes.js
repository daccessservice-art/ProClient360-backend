const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { isLoggedIn } = require('../middlewares/auth');

// ⚠️ Named routes MUST stay above "/:id" routes

// ✅ NEW — mobile + web
router.get('/unread-count',   isLoggedIn, notificationController.unreadCount);
router.put('/mark-all-read',  isLoggedIn, notificationController.markAllAsRead);
router.delete('/clear-all',   isLoggedIn, notificationController.clearAll);
router.put('/fcm-token',      isLoggedIn, notificationController.saveFcmToken);

// existing
router.get('/',       isLoggedIn, notificationController.showAll);
router.post('/',      isLoggedIn, (req, res) => notificationController.create(req, res, req.app.get('io')));
router.put('/:id',    isLoggedIn, notificationController.markAsRead);
router.delete('/:id', isLoggedIn, notificationController.delete);

module.exports = router;