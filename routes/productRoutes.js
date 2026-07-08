const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const {
  showAll,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getAllProductsForReport,
  getDuplicateProducts,
  bulkDeleteProducts,
  getBrandsList,
} = require('../controllers/productController');

const router = express.Router();

// ── FIXED: All specific named GET routes MUST come before /:id,
// otherwise Express matches "brands" or "duplicates" as an :id param ──

router.get('/', permissionMiddleware(['viewProduct']), showAll);
router.get('/report/all', permissionMiddleware(['viewProduct']), getAllProductsForReport);
router.get('/brands', permissionMiddleware(['viewProduct']), getBrandsList);
router.get('/duplicates', permissionMiddleware(['viewProduct']), getDuplicateProducts);
router.delete('/bulk', permissionMiddleware(['deleteProduct']), bulkDeleteProducts);

// ── Parameterized route LAST — it's a catch-all for any single-segment GET ──
router.get('/:id', permissionMiddleware(['viewProduct']), getProduct);

router.post('/', permissionMiddleware(['createProduct']), createProduct);
router.put('/:id', permissionMiddleware(['updateProduct']), updateProduct);
router.delete('/:id', permissionMiddleware(['deleteProduct']), deleteProduct);

module.exports = router;