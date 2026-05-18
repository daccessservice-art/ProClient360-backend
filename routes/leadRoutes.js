const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const salesManagerController = require('../controllers/salesManagerController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');
const { Types } = require('mongoose');
const Lead = require('../models/leadsModel');
const { autoMarkStaleLeads } = require('../scripts/autoMarkStaleLeads');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/survey-reports');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Clean filename - remove special characters
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(cleanName);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'reportFile':  /\.(doc|docx)$/i,
    'drawingFile': /\.(pdf)$/i,
    'boqFile':     /\.(xls|xlsx)$/i
  };

  const fieldName = file.fieldname;
  if (allowedTypes[fieldName] && allowedTypes[fieldName].test(file.originalname)) {
    cb(null, true);
  } else {
    const allowedMsg = fieldName === 'reportFile'
      ? 'Word files (.doc, .docx) only'
      : fieldName === 'drawingFile'
        ? 'PDF files only'
        : 'Excel files (.xls, .xlsx) only';
    cb(new Error(`Invalid file type for ${fieldName}. Allowed: ${allowedMsg}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

console.log('📋 Registering Lead Routes...');

// Manual stale lead processing
router.post('/process-stale-leads', permissionMiddleware(['admin']), async (req, res) => {
  try {
    console.log('Manual trigger for processing stale leads');
    const result = await autoMarkStaleLeads();
    if (result.success) {
      res.status(200).json({ success: true, message: `Successfully processed stale leads. Marked ${result.markedCount} leads as not-feasible.`, data: result });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error in manual stale lead processing:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

// ✅ NEW: Old Sales History Route (Must be before /:id routes)
router.get('/old-sales-history', permissionMiddleware(['viewLead']), salesManagerController.getOldSalesHistory);

// Get my leads
router.get('/my-leads', permissionMiddleware(['viewLead']), leadController.getMyLeads);

// Get call unanswered leads
router.get('/call-unanswered', permissionMiddleware(['viewLead']), leadController.getCallUnansweredLeads);

// Get not feasible leads
router.get('/not-feasible', permissionMiddleware(['viewLead']), leadController.getNotFeasibleLeads);

// Get feasible leads
router.get('/feasible-leads', permissionMiddleware(['viewLead']), leadController.getFeasibleLeads);

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
    const user   = req.user;
    const leadId = req.params.id;
    const { day, attempt, date, status, remarks, attemptedBy } = req.body;

    if (!Types.ObjectId.isValid(leadId)) return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });
    if (!user) return res.status(401).json({ success: false, error: 'User not authenticated. Please log in.' });

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found or you do not have access to this lead.' });
    if (!day || !attempt) return res.status(400).json({ success: false, error: 'Day and attempt are required fields.' });

    const existingCallIndex = lead.callHistory.findIndex(call => call.day === day && call.attempt === attempt);
    if (existingCallIndex !== -1) return res.status(400).json({ success: false, error: `Day ${day} - Attempt ${attempt} is already recorded` });

    const isFirstCall = lead.callHistory.length === 0;
    const newCall = { day, attempt, date: date || new Date(), status: status || 'attempted', remarks: remarks || '', attemptedBy: attemptedBy || user._id };
    lead.callHistory.push(newCall);

    if (isFirstCall) { lead.firstCallDate = new Date(); }
    lead.callHistory.sort((a, b) => { if (a.day !== b.day) return a.day - b.day; return a.attempt - b.attempt; });

    await lead.save();

    const savedCall = lead.callHistory.find(call => call.day === day && call.attempt === attempt);
    res.status(200).json({ success: true, message: 'Call attempt recorded successfully.', data: savedCall });
  } catch (error) {
    console.error('Error in call attempt:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

console.log('✅ /call-attempt/:id route registered successfully');

// Marketing to Sales assignment
router.put('/assign/:id', permissionMiddleware(['assignLead']), leadController.assignLead);

// Sales to Sales reassignment
router.put('/reassign/:id', permissionMiddleware(['updateLead']), leadController.assignLead);

router.put('/transfer-ownership', permissionMiddleware(['updateLead']), leadController.transferOwnership);

// Submit enquiry
router.put('/submit-enquiry/:id', isLoggedIn, leadController.submiEnquiry);

// Sales Manager specific route
router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);

// Update lead
router.put('/:id', permissionMiddleware(['updateLead']), leadController.updateLead);

// Delete lead
router.delete('/:id', permissionMiddleware(['deleteLead']), leadController.deleteLead);

// Get all marketing leads
router.get('/', permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);

// Create new lead
router.post('/', permissionMiddleware(['createLead']), leadController.createLead);

// ========== SURVEY ENGINEER ROUTES ==========

// ✅ Submit survey report with file uploads (Word, PDF, Excel) — uses multer
router.put('/survey-report/:id', isLoggedIn, upload.fields([
  { name: 'reportFile',  maxCount: 1 },
  { name: 'drawingFile', maxCount: 1 },
  { name: 'boqFile',     maxCount: 1 }
]), leadController.submitSurveyReport);

// Get survey engineers list
router.get('/survey-engineers', isLoggedIn, async (req, res) => {
  try {
    const Employee = require('../models/employeeModel');
    const surveyEngineers = await Employee.find({
      role: { $in: ['Pre Sales Executive', 'pre sales executive', 'Pre_Sales_Executive'] },
      company: req.user.company || req.user._id
    }).select('name email department role');

    res.status(200).json({ success: true, employees: surveyEngineers });
  } catch (error) {
    console.error('Error fetching survey engineers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leads assigned to current survey engineer - FIXED
router.get('/my-survey-leads', isLoggedIn, async (req, res) => {
  try {
    const user = req.user;
    const leads = await Lead.find({
      assignedSurveyEngineer: new Types.ObjectId(user._id),
      company: user.company || user._id
    })
    .populate('assignedTo', 'name email')
    .populate('assignedBy', 'name email')
    .populate('assignedSurveyEngineer', 'name email')
    .populate('company', 'name')
    .sort({ surveyEngineerAssignedAt: -1, createdAt: -1 });

    res.status(200).json({ success: true, leads });
  } catch (error) {
    console.error('Error fetching survey leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Meeting log
router.put("/meeting-log/:id", isLoggedIn, leadController.saveMeetingLog);

console.log('✅ All lead routes registered successfully');

if (process.env.NODE_ENV !== 'production') {
  router.get('/debug-routes', (req, res) => {
    const routes = [];
    router.stack.forEach((middleware) => {
      if (middleware.route) routes.push({ path: middleware.route.path, methods: Object.keys(middleware.route.methods) });
    });
    res.json({ routes });
  });
}

module.exports = router;