const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const {permissionMiddleware, isLoggedIn} = require('../middlewares/auth');


router.get('/dashboard',isLoggedIn, employeeController.dashboard);

router.get('/',permissionMiddleware(['viewEmployee']),employeeController.showAll);

// ✅ FIXED: Changed from viewEmployee to isLoggedIn - so all logged-in users can access for dropdowns
router.get('/all', isLoggedIn, employeeController.getAllEmployees);

router.get('/dropdown', isLoggedIn, employeeController.getEmployeesForDropdown); // ✅ NEW: Lightweight dropdown endpoint

router.get('/search',permissionMiddleware(['viewEmployee']), employeeController.search);

router.post('/', permissionMiddleware(['createEmployee']),employeeController.create);

router.delete('/:id', permissionMiddleware(['deleteEmployee']), employeeController.deleteEmployee);

router.put('/:id', permissionMiddleware(['updateEmployee']), employeeController.updateEmployee);   

router.get('/:id', permissionMiddleware(['viewEmployee']), employeeController.getEmployee);

module.exports = router;