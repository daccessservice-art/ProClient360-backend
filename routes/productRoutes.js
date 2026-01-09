const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createProduct, updateProduct, deleteProduct, getProduct } = require('../controllers/productController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewProduct']), showAll);
router.get('/:id', permissionMiddleware(['viewProduct']), getProduct);
router.post('/', permissionMiddleware(['createProduct']), createProduct);
router.put('/:id', permissionMiddleware(['updateProduct']), updateProduct);
router.delete('/:id', permissionMiddleware(['deleteProduct']), deleteProduct);

module.exports = router;