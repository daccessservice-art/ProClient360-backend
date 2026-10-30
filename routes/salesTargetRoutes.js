const express = require('express');
const router = express.Router();
const salesTargetController = require('../controllers/salesTargetController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');

// Sales employee: own target + achievement + incentive
router.get('/my', isLoggedIn, salesTargetController.my);

// HR: all sales employees for a financial year
router.get('/', permissionMiddleware(['viewEmployee']), salesTargetController.list);

// HR: one employee
router.get('/employee/:id', permissionMiddleware(['viewEmployee']), salesTargetController.getForEmployee);

// HR: add / update target (same permission as editing an employee)
router.put('/employee/:id', permissionMiddleware(['updateEmployee']), salesTargetController.upsertForEmployee);

module.exports = router;