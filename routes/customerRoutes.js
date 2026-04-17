const express = require('express');
const { permissionMiddleware, isCompany } = require('../middlewares/auth');
const { showAll, createCustomer, updateCustomer, deleteCustomer, getCustomer, exportCustomersPDF, exportCustomersExcel, getCustomersForBranch } = require('../controllers/customerController');
const router = express.Router();

// Export routes MUST come BEFORE parameterized routes
router.get('/export/pdf', permissionMiddleware(['viewCustomer']), exportCustomersPDF);
router.get('/export/excel', permissionMiddleware(['viewCustomer']), exportCustomersExcel);

// Get ALL customers for branch dropdown (with search)
router.get('/branch-customers', permissionMiddleware(['viewCustomer']), getCustomersForBranch);

// General routes
router.get('/', permissionMiddleware(['viewCustomer']), showAll);

// Parameterized routes come AFTER specific routes
router.get('/:id', permissionMiddleware(['viewCustomer']), getCustomer);

router.post('/', permissionMiddleware(['createCustomer', 'createLead']), createCustomer);

router.put('/:id', permissionMiddleware(['updateCustomer']), updateCustomer);

router.delete('/:id', permissionMiddleware(['deleteCustomer']), deleteCustomer);

module.exports = router;