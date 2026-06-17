const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const {
  showAll,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getAllProductsForReport,
  getDuplicateProducts,  // ✅ NEW
  bulkDeleteProducts,    // ✅ NEW
} = require('../controllers/productController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewProduct']), showAll);
router.get('/report/all', permissionMiddleware(['viewProduct']), getAllProductsForReport);
router.get('/duplicates', permissionMiddleware(['viewProduct']), getDuplicateProducts); // ✅ NEW ROUTE
router.delete('/bulk', permissionMiddleware(['deleteProduct']), bulkDeleteProducts);     // ✅ NEW ROUTE
router.get('/:id', permissionMiddleware(['viewProduct']), getProduct);
router.post('/', permissionMiddleware(['createProduct']), createProduct);
router.put('/:id', permissionMiddleware(['updateProduct']), updateProduct);
router.delete('/:id', permissionMiddleware(['deleteProduct']), deleteProduct);

module.exports = router;