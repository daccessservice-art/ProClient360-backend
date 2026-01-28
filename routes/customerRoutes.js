const express = require('express');
const { permissionMiddleware, isCompany } = require('../middlewares/auth');
const { showAll, createCustomer, updateCustomer, deleteCustomer, getCustomer, exportCustomersPDF, exportCustomersExcel } = require('../controllers/customerController');
const router = express.Router();

// IMPORTANT: Export routes MUST come BEFORE parameterized routes like /:id
// Otherwise Express treats 'export' as an ID parameter
router.get('/export/pdf', permissionMiddleware(['viewCustomer']), exportCustomersPDF);
router.get('/export/excel', permissionMiddleware(['viewCustomer']), exportCustomersExcel);

// General routes
router.get('/', permissionMiddleware(['viewCustomer']), showAll);

// Parameterized routes come AFTER specific routes
router.get('/:id', permissionMiddleware(['viewCustomer']), getCustomer);

router.post('/', permissionMiddleware(['createCustomer']), createCustomer);

router.put('/:id', permissionMiddleware(['updateCustomer']), updateCustomer);

router.delete('/:id', permissionMiddleware(['deleteCustomer']), deleteCustomer);

module.exports = router;