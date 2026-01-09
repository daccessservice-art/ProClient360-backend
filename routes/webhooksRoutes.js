const express = require('express');
const router = express.Router();

const webhooksController = require('../controllers/webhooksController');
const { permissionMiddleware } = require('../middlewares/auth');

router.post('/indiamart/:id', webhooksController.indiaMartWebhook);

router.post('/google/:id', webhooksController.googleWebhook);

module.exports = router;