const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const salesManagerController = require('../controllers/salesManagerController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');
const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');
const { autoMarkStaleLeads } = require('../scripts/autoMarkStaleLeads');

// FIXED: Route to handle saving individual call attempts - ONLY requires login, no special permissions
router.post('/call-attempt/:id', isLoggedIn, async (req, res) => {
  try {
    console.log('=== CALL ATTEMPT API CALLED ===');
    console.log('Lead ID:', req.params.id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user ? { 
      id: req.user._id, 
      company: req.user.company,
      permissions: req.user.permissions,
      userType: req.user.user 
    } : 'No user');

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

    // Find the lead belonging to this company
    const lead = await Lead.findOne({
      _id: leadId,
      company: user.company || user._id
    });

    if (!lead) {
      console.error('Lead not found or access denied');
      console.error('Search criteria:', {
        _id: leadId,
        company: user.company || user._id
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Lead not found or you do not have access to this lead.' 
      });
    }

    console.log('Lead found:', {
      id: lead._id,
      company: lead.company,
      currentCallHistoryLength: lead.callHistory.length,
      currentFeasibility: lead.feasibility
    });

    // Validate required fields
    if (!day || !attempt) {
      return res.status(400).json({
        success: false,
        error: 'Day and attempt are required fields.'
      });
    }

    // Check if this call attempt already exists
    const existingCallIndex = lead.callHistory.findIndex(
      call => call.day === day && call.attempt === attempt
    );

    if (existingCallIndex !== -1) {
      console.error('Call attempt already exists:', { day, attempt });
      return res.status(400).json({
        success: false,
        error: `Day ${day} - Attempt ${attempt} is already recorded`
      });
    }

    // Check if this is the first call attempt for this lead
    const isFirstCall = lead.callHistory.length === 0;

    // Add the new call attempt
    const newCall = {
      day,
      attempt,
      date: date || new Date(),
      status: status || 'attempted',
      remarks: remarks || '',
      attemptedBy: attemptedBy || user._id
    };

    console.log('Adding new call attempt:', newCall);

    lead.callHistory.push(newCall);

    // Set the first call date if this is the first call
    if (isFirstCall) {
      lead.firstCallDate = new Date();
      console.log('Setting first call date:', lead.firstCallDate);
    }

    // Sort the call history by day and attempt
    lead.callHistory.sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return a.attempt - b.attempt;
    });

    // CRITICAL: DO NOT CHANGE FEASIBILITY HERE
    // The feasibility should only be changed when the user submits the form via /assign/:id
    // Recording call attempts does NOT automatically mark as call-unanswered
    // This keeps the lead on the marketing page with feasibility = 'none'
    
    console.log('Saving lead with call history...');
    console.log('Feasibility remains:', lead.feasibility);
    
    await lead.save();

    console.log('=== LEAD SAVED SUCCESSFULLY ===');
    console.log('Final call history length:', lead.callHistory.length);
    console.log('Final feasibility (unchanged):', lead.feasibility);

    // Return the saved call attempt
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
    console.error('Error Stack:', error.stack);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error: ' + error.message
    });
  }
});

// ... rest of your routes
router.get('/', permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);
router.get('/my-leads', permissionMiddleware(['viewLead']), leadController.getMyLeads);
router.get('/call-unanswered', permissionMiddleware(['viewLead']), leadController.getCallUnansweredLeads);
router.post('/', permissionMiddleware(['createLead']), leadController.createLead);
router.put('/:id', permissionMiddleware(['updateLead']), leadController.updateLead);
router.delete('/:id', permissionMiddleware(['deleteLead']), leadController.deleteLead);

// Marketing to Sales assignment - THIS is where feasibility changes happen
router.put('/assign/:id', permissionMiddleware(['assignLead']), leadController.assignLead);

// Sales to Sales assignment
router.put('/reassign/:id', permissionMiddleware(['updateLead']), leadController.assignLead);

router.put('/submit-enquiry/:id', isLoggedIn, leadController.submiEnquiry);

// Sales Manager Master routes
router.get('/sales-employees', permissionMiddleware(['viewLead']), salesManagerController.getSalesEmployees);
router.get('/sales-managers', permissionMiddleware(['viewLead']), salesManagerController.getSalesManagers);
router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);
router.get('/all-leads', permissionMiddleware(['viewLead']), salesManagerController.getAllLeads);

// New route to manually trigger the stale lead processing
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

module.exports = router;