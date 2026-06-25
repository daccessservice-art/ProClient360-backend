const express = require('express');
const router = express.Router();

const callLogController = require('../controllers/callLogController');
const { permissionMiddleware } = require('../middlewares/auth');

router.use(permissionMiddleware(["viewFeedback"]));

router.get('/summary', callLogController.summary);
router.get('/stats', callLogController.stats);
router.get('/service/:serviceId', callLogController.getByService);
router.post('/', callLogController.create);
router.put('/:id', callLogController.update);
router.delete('/:id', callLogController.delete);

module.exports = router;