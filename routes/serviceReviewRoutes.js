const express = require('express');
const router  = express.Router();

const serviceReviewController = require('../controllers/serviceReviewController');
const { permissionMiddleware } = require('../middlewares/auth');

router.get('/',  permissionMiddleware(['viewService']),   serviceReviewController.showByEngineer);
router.post('/', permissionMiddleware(['updateService']), serviceReviewController.upsert);

module.exports = router;