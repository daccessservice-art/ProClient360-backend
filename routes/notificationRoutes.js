const express = require('express');
const notificationController = require('../controllers/notificationController');
const { isLoggedIn } = require('../middlewares/auth');

const router = express.Router();

router.get('/', isLoggedIn, notificationController.showAll);

router.post('/', isLoggedIn, (req, res) => {
    const io= req.app.get('io');
    notificationController.create(req, res, io);
});

router.put('/:id', isLoggedIn, notificationController.markAsRead);

router.delete('/:id', isLoggedIn, notificationController.delete);

module.exports = router;