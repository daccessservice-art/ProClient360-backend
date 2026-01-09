const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {isLoggedIn, isCompany } = require('../middlewares/auth');


router.post('/login',authController.login);

router.get('/logout',isLoggedIn, authController.logout);

router.post('/forget-password',authController.forgetPassword);

router.post('/reset-password/:id/:token',authController.resetPassword);

router.post('/change-password', isLoggedIn, authController.changePassword);

module.exports = router;
