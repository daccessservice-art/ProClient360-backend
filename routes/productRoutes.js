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
  getCategoriesList,
} = require('../controllers/productController');

const router = express.Router();

// ── All specific named GET routes BEFORE /:id ──
router.get('/', permissionMiddleware(['viewProduct']), showAll);
router.get('/report/all', permissionMiddleware(['viewProduct']), getAllProductsForReport);
router.get('/brands', permissionMiddleware(['viewProduct']), getBrandsList);
router.get('/categories', permissionMiddleware(['viewProduct']), getCategoriesList);
router.get('/duplicates', permissionMiddleware(['viewProduct']), getDuplicateProducts);
router.delete('/bulk', permissionMiddleware(['deleteProduct']), bulkDeleteProducts);

// ── Parameterized route LAST ──
router.get('/:id', permissionMiddleware(['viewProduct']), getProduct);

router.post('/', permissionMiddleware(['createProduct']), createProduct);
router.put('/:id', permissionMiddleware(['updateProduct']), updateProduct);
router.delete('/:id', permissionMiddleware(['deleteProduct']), deleteProduct);

module.exports = router;