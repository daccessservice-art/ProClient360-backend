const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createVendor, updateVendor, deleteVendor, getVendor } = require('../controllers/vendorController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewVendor']), showAll);
router.get('/:id', permissionMiddleware(['viewVendor']), getVendor);
router.post('/', permissionMiddleware(['createVendor']), createVendor);
router.put('/:id', permissionMiddleware(['updateVendor']), updateVendor);
router.delete('/:id', permissionMiddleware(['deleteVendor']), deleteVendor);

module.exports = router;