const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const {permissionMiddleware, isLoggedIn} = require('../middlewares/auth');

router.get('/', permissionMiddleware(['viewInventory']), inventoryController.showAll);
router.get('/search', permissionMiddleware(['viewInventory']), inventoryController.search);
router.get('/low-stock', permissionMiddleware(['viewInventory']), inventoryController.getLowStockItems);
router.get('/category/:category', permissionMiddleware(['viewInventory']), inventoryController.getInventoryByCategory);
router.get('/:id', permissionMiddleware(['viewInventory']), inventoryController.getInventory);
router.get('/:id/transactions', permissionMiddleware(['viewInventory']), inventoryController.getTransactionHistory);
router.post('/', permissionMiddleware(['createInventory']), inventoryController.create);
router.put('/:id', permissionMiddleware(['updateInventory']), inventoryController.updateInventory);
router.delete('/:id', permissionMiddleware(['deleteInventory']), inventoryController.deleteInventory);

module.exports = router;