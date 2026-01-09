const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const salesManagerController = require('../controllers/salesManagerController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');

router.get('/', permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);
router.get('/my-leads', permissionMiddleware(['viewLead']), leadController.getMyLeads);
router.post('/', permissionMiddleware(['createLead']), leadController.createLead);
router.put('/:id', permissionMiddleware(['updateLead']), leadController.updateLead);
router.delete('/:id', permissionMiddleware(['deleteLead']), leadController.deleteLead);

// Marketing to Sales assignment
router.put('/assign/:id', permissionMiddleware(['assignLead']), leadController.assignLead);

// Sales to Sales assignment
router.put('/reassign/:id', permissionMiddleware(['updateLead']), leadController.assignLead);

router.put('/submit-enquiry/:id', isLoggedIn, leadController.submiEnquiry);

// Sales Manager Master routes
router.get('/sales-employees', permissionMiddleware(['viewLead']), salesManagerController.getSalesEmployees);
router.get('/sales-managers', permissionMiddleware(['viewLead']), salesManagerController.getSalesManagers);
router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);
// Add the new route for all leads
router.get('/all-leads', permissionMiddleware(['viewLead']), salesManagerController.getAllLeads);

module.exports = router;