const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { permissionMiddleware } = require('../middlewares/auth');

// ── Named routes BEFORE '/:id' ──
router.get('/', permissionMiddleware(['viewInventory']), inventoryController.showAll);
router.get('/search', permissionMiddleware(['viewInventory']), inventoryController.search);
router.get('/movements', permissionMiddleware(['viewInventory']), inventoryController.getAllMovements);
router.get('/low-stock', permissionMiddleware(['viewInventory']), inventoryController.getLowStockItems);
router.get('/category/:category', permissionMiddleware(['viewInventory']), inventoryController.getInventoryByCategory);

// ── Item routes ──
router.get('/:id/ledger', permissionMiddleware(['viewInventory']), inventoryController.getStockLedger);
router.get('/:id/transactions', permissionMiddleware(['viewInventory']), inventoryController.getTransactionHistory);
router.get('/:id', permissionMiddleware(['viewInventory']), inventoryController.getInventory);

router.post('/sync', permissionMiddleware(['viewInventory']), inventoryController.syncWithProductMaster);
router.post('/', permissionMiddleware(['createInventory']), inventoryController.create);
router.put('/:id', permissionMiddleware(['updateInventory']), inventoryController.updateInventory);
router.delete('/:id', permissionMiddleware(['deleteInventory']), inventoryController.deleteInventory);

module.exports = router;