const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createDeliveryChallan, updateDeliveryChallan, deleteDeliveryChallan, getDeliveryChallan
} = require('../controllers/deliveryChallanController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewDC']), showAll);
router.get('/:id', permissionMiddleware(['viewDC']), getDeliveryChallan);
router.post('/', permissionMiddleware(['createDC']), createDeliveryChallan);
router.put('/:id', permissionMiddleware(['updateDC']), updateDeliveryChallan);
router.delete('/:id', permissionMiddleware(['deleteDC']), deleteDeliveryChallan);

module.exports = router;