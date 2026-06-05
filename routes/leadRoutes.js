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

// ════════════════════════════════════════════════════════════════════
//  MULTER CONFIG — Survey Report File Uploads
// ════════════════════════════════════════════════════════════════════
const uploadDir = path.join(__dirname, '../uploads/survey-reports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(cleanName);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const rules = {
    reportFile:  /\.(doc|docx)$/i,
    drawingFile: /\.(pdf)$/i,
    boqFile:     /\.(xls|xlsx)$/i,
  };
  const rule = rules[file.fieldname];
  if (rule && rule.test(file.originalname)) {
    cb(null, true);
  } else {
    const hint =
      file.fieldname === 'reportFile'  ? '.doc / .docx' :
      file.fieldname === 'drawingFile' ? '.pdf' :
      file.fieldname === 'boqFile'     ? '.xls / .xlsx' : 'unknown field';
    cb(new Error(`Invalid file type for "${file.fieldname}". Allowed: ${hint}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Multer error-handling wrapper — returns proper JSON instead of crashing
const handleSurveyUpload = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: 'reportFile',  maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'boqFile',     maxCount: 1 },
  ]);
  uploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

console.log('📋 Registering Lead Routes...');

// ════════════════════════════════════════════════════════════════════
//  ⚠️  IMPORTANT: ALL named routes MUST come BEFORE /:id routes.
//     Express matches top-to-bottom. PUT /:id would match
//     PUT /survey-report/:id if registered first — causing the
//     network error on survey report submission.
// ════════════════════════════════════════════════════════════════════

// ── Utility ──────────────────────────────────────────────────────────
router.post('/process-stale-leads', permissionMiddleware(['admin']), async (req, res) => {
  try {
    const result = await autoMarkStaleLeads();
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: `Successfully processed stale leads. Marked ${result.markedCount} leads as not-feasible.`,
        data: result,
      });
    }
    res.status(500).json({ success: false, error: result.error });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

// ── GET named routes (all before generic /:id) ───────────────────────
router.get('/old-sales-history',  permissionMiddleware(['viewLead']), salesManagerController.getOldSalesHistory);
router.get('/my-leads',           permissionMiddleware(['viewLead']), leadController.getMyLeads);
router.get('/call-unanswered',    permissionMiddleware(['viewLead']), leadController.getCallUnansweredLeads);
router.get('/not-feasible',       permissionMiddleware(['viewLead']), leadController.getNotFeasibleLeads);
router.get('/feasible-leads',     permissionMiddleware(['viewLead']), leadController.getFeasibleLeads);
router.get('/sales-employees',    permissionMiddleware(['viewLead']), salesManagerController.getSalesEmployees);
router.get('/sales-managers',     permissionMiddleware(['viewLead']), salesManagerController.getSalesManagers);
router.get('/all-leads',          permissionMiddleware(['viewLead']), salesManagerController.getAllLeads);

router.get('/survey-engineers', isLoggedIn, async (req, res) => {
  try {
    const Employee = require('../models/employeeModel');
    const surveyEngineers = await Employee.find({
      role: { $in: ['Pre Sales Executive', 'pre sales executive', 'Pre_Sales_Executive'] },
      company: req.user.company || req.user._id,
    }).select('name email department role');
    res.status(200).json({ success: true, employees: surveyEngineers });
  } catch (error) {
    console.error('Error fetching survey engineers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/my-survey-leads', isLoggedIn, async (req, res) => {
  try {
    const user = req.user;
    const leads = await Lead.find({
      assignedSurveyEngineer: new Types.ObjectId(user._id),
      company: user.company || user._id,
    })
      .populate('assignedTo',             'name email')
      .populate('assignedBy',             'name email')
      .populate('assignedSurveyEngineer', 'name email')
      .populate('company',                'name')
      .sort({ surveyEngineerAssignedAt: -1, createdAt: -1 });

    res.status(200).json({ success: true, leads });
  } catch (error) {
    console.error('Error fetching survey leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);

// ── POST named routes (before /:id) ──────────────────────────────────
router.post('/call-attempt/:id', isLoggedIn, async (req, res) => {
  try {
    const user   = req.user;
    const leadId = req.params.id;
    const { day, attempt, date, status, remarks, attemptedBy } = req.body;

    if (!Types.ObjectId.isValid(leadId))
      return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    if (!day || !attempt)
      return res.status(400).json({ success: false, error: 'Day and attempt are required.' });

    const exists = lead.callHistory.findIndex(c => c.day === day && c.attempt === attempt);
    if (exists !== -1)
      return res.status(400).json({ success: false, error: `Day ${day} - Attempt ${attempt} already recorded.` });

    const isFirst = lead.callHistory.length === 0;
    lead.callHistory.push({
      day, attempt,
      date:        date || new Date(),
      status:      status || 'attempted',
      remarks:     remarks || '',
      attemptedBy: attemptedBy || user._id,
    });
    if (isFirst) lead.firstCallDate = new Date();
    lead.callHistory.sort((a, b) => a.day !== b.day ? a.day - b.day : a.attempt - b.attempt);

    await lead.save();
    const saved = lead.callHistory.find(c => c.day === day && c.attempt === attempt);
    res.status(200).json({ success: true, message: 'Call attempt recorded.', data: saved });
  } catch (error) {
    console.error('Error in call attempt:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

// ── PUT named routes (ALL before generic PUT /:id) ────────────────────
router.put('/assign/:id',         permissionMiddleware(['assignLead']), leadController.assignLead);
router.put('/reassign/:id',       permissionMiddleware(['updateLead']), leadController.assignLead);
router.put('/transfer-ownership', permissionMiddleware(['updateLead']), leadController.transferOwnership);
router.put('/submit-enquiry/:id', isLoggedIn,                          leadController.submiEnquiry);
router.put('/meeting-log/:id',    isLoggedIn,                          leadController.saveMeetingLog);

// ✅ SURVEY REPORT ROUTE — must be BEFORE PUT /:id
//    Root cause of network error: in the original file this route was
//    registered AFTER PUT /:id, so Express matched /:id first,
//    treated "survey-report" as the id value, called updateLead()
//    which doesn't handle multipart/form-data → network error.
router.put(
  '/survey-report/:id',
  isLoggedIn,
  handleSurveyUpload,
  leadController.submitSurveyReport
);

// ── Generic /:id — ALWAYS LAST ────────────────────────────────────────
router.get('/',       permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);
router.post('/',      permissionMiddleware(['createLead']),             leadController.createLead);
router.put('/:id',    permissionMiddleware(['updateLead']),             leadController.updateLead);
router.delete('/:id', permissionMiddleware(['deleteLead']),             leadController.deleteLead);

// ── Debug (dev only) ──────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug-routes', (req, res) => {
    const routes = [];
    router.stack.forEach((m) => {
      if (m.route) routes.push({ path: m.route.path, methods: Object.keys(m.route.methods) });
    });
    res.json({ routes });
  });
}

console.log('✅ All lead routes registered successfully');

module.exports = router;