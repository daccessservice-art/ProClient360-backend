const express = require('express');
const { permissionMiddleware, isCompany } = require('../middlewares/auth');
const {
  showAll, createCustomer, updateCustomer, deleteCustomer, getCustomer,
  exportCustomersPDF, exportCustomersExcel, getCustomersForBranch,
  exportVerifiedCustomersPDF, exportNotVerifiedCustomersPDF,
  checkCustomerExists, // ← NEW
} = require('../controllers/customerController');
const router = express.Router();

router.get('/export/pdf', permissionMiddleware(['viewCustomer']), exportCustomersPDF);
router.get('/export/pdf/verified', permissionMiddleware(['viewCustomer']), exportVerifiedCustomersPDF);
router.get('/export/pdf/not-verified', permissionMiddleware(['viewCustomer']), exportNotVerifiedCustomersPDF);
router.get('/export/excel', permissionMiddleware(['viewCustomer']), exportCustomersExcel);
router.get('/branch-customers', permissionMiddleware(['viewCustomer']), getCustomersForBranch);
router.get('/check-exists', permissionMiddleware(['viewCustomer']), checkCustomerExists); // ← NEW, must stay before '/:id'
router.get('/', permissionMiddleware(['viewCustomer']), showAll);
router.get('/:id', permissionMiddleware(['viewCustomer']), getCustomer);
router.post('/', permissionMiddleware(['createCustomer', 'createLead']), createCustomer);
router.put('/:id', permissionMiddleware(['updateCustomer']), updateCustomer);
router.delete('/:id', permissionMiddleware(['deleteCustomer']), deleteCustomer);

module.exports = router;