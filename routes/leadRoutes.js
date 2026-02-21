const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const salesManagerController = require('../controllers/salesManagerController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');
const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');
const { autoMarkStaleLeads } = require('../scripts/autoMarkStaleLeads');

console.log('📋 Registering Lead Routes...');

// Manual stale lead processing
router.post('/process-stale-leads', permissionMiddleware(['admin']), async (req, res) => {
  try {
    console.log('Manual trigger for processing stale leads');
    const result = await autoMarkStaleLeads();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: `Successfully processed stale leads. Marked ${result.markedCount} leads as not-feasible.`,
        data: result
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in manual stale lead processing:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error: ' + error.message
    });
  }
});

// Get my leads
router.get('/my-leads', permissionMiddleware(['viewLead']), leadController.getMyLeads);

// Get call unanswered leads
router.get('/call-unanswered', permissionMiddleware(['viewLead']), leadController.getCallUnansweredLeads);

// NEW: Get not feasible leads
router.get('/not-feasible', permissionMiddleware(['viewLead']), leadController.getNotFeasibleLeads);

// Get sales employees
router.get('/sales-employees', permissionMiddleware(['viewLead']), salesManagerController.getSalesEmployees);

// Get sales managers
router.get('/sales-managers', permissionMiddleware(['viewLead']), salesManagerController.getSalesManagers);

// Get all leads
router.get('/all-leads', permissionMiddleware(['viewLead']), salesManagerController.getAllLeads);

// CALL ATTEMPT ROUTE
console.log('✅ Registering /call-attempt/:id route');

router.post('/call-attempt/:id', isLoggedIn, async (req, res) => {
  try {
    console.log('=== CALL ATTEMPT API CALLED ===');
    const user = req.user;
    const leadId = req.params.id;
    const { day, attempt, date, status, remarks, attemptedBy } = req.body;

    if (!Types.ObjectId.isValid(leadId)) {
      console.error('Invalid lead ID format:', leadId);
      return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });
    }

    if (!user) {
      console.error('User not authenticated');
      return res.status(401).json({ success: false, error: 'User not authenticated. Please log in.' });
    }

    const lead = await Lead.findOne({
      _id: leadId,
      company: user.company || user._id
    });

    if (!lead) {
      console.error('Lead not found or access denied');
      return res.status(404).json({ 
        success: false, 
        error: 'Lead not found or you do not have access to this lead.' 
      });
    }

    if (!day || !attempt) {
      return res.status(400).json({
        success: false,
        error: 'Day and attempt are required fields.'
      });
    }

    const existingCallIndex = lead.callHistory.findIndex(
      call => call.day === day && call.attempt === attempt
    );

    if (existingCallIndex !== -1) {
      console.error('❌ Call attempt already exists:', { day, attempt });
      return res.status(400).json({
        success: false,
        error: `Day ${day} - Attempt ${attempt} is already recorded`
      });
    }

    const isFirstCall = lead.callHistory.length === 0;

    const newCall = {
      day,
      attempt,
      date: date || new Date(),
      status: status || 'attempted',
      remarks: remarks || '',
      attemptedBy: attemptedBy || user._id
    };

    console.log('➕ Adding new call attempt:', newCall);

    lead.callHistory.push(newCall);

    if (isFirstCall) {
      lead.firstCallDate = new Date();
      console.log('📅 Setting first call date:', lead.firstCallDate);
    }

    lead.callHistory.sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return a.attempt - b.attempt;
    });
    
    console.log('Saving lead with call history...');
    
    await lead.save();

    console.log('=== LEAD SAVED SUCCESSFULLY ===');

    const savedCall = lead.callHistory.find(
      call => call.day === day && call.attempt === attempt
    );

    res.status(200).json({
      success: true,
      message: 'Call attempt recorded successfully.',
      data: savedCall
    });
  } catch (error) {
    console.error('=== ERROR IN CALL ATTEMPT API ===');
    console.error('Error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error: ' + error.message
    });
  }
});

console.log('✅ /call-attempt/:id route registered successfully');

// ROUTES WITH :id IN THE PATH

// Marketing to Sales assignment
router.put('/assign/:id', permissionMiddleware(['assignLead']), leadController.assignLead);

// Sales to Sales reassignment
router.put('/reassign/:id', permissionMiddleware(['updateLead']), leadController.assignLead);

// Submit enquiry
router.put('/submit-enquiry/:id', isLoggedIn, leadController.submiEnquiry);

// Sales Manager specific route - get employee leads
router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);

// Update lead
router.put('/:id', permissionMiddleware(['updateLead']), leadController.updateLead);

// Delete lead
router.delete('/:id', permissionMiddleware(['deleteLead']), leadController.deleteLead);

// GENERIC ROUTES

// Get all marketing leads
router.get('/', permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);

// Create new lead
router.post('/', permissionMiddleware(['createLead']), leadController.createLead);

console.log('✅ All lead routes registered successfully');

// DEBUG ROUTE
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug-routes', (req, res) => {
    const routes = [];
    router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      }
    });
    res.json({ routes });
  });
}

module.exports = router;