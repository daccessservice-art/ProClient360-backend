const express = require('express');
const router  = express.Router();
const leadController          = require('../controllers/leadController');
const salesManagerController  = require('../controllers/salesManagerController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');
const { Types } = require('mongoose');
const Lead = require('../models/leadsModel');
const { autoMarkStaleLeads } = require('../scripts/autoMarkStaleLeads');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ════════════════════════════════════════════════════════════════════
//  MULTER CONFIG
// ════════════════════════════════════════════════════════════════════
const uploadDir = path.join(__dirname, '../uploads/survey-reports');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const clean  = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + suffix + path.extname(clean));
  }
});

const fileFilter = (req, file, cb) => {
  const rules = {
    reportFile:  /\.(doc|docx)$/i,
    drawingFile: /\.(pdf)$/i,
    boqFile:     /\.(xls|xlsx)$/i,
  };
  const rule = rules[file.fieldname];
  if (rule && rule.test(file.originalname)) return cb(null, true);
  const hint =
    file.fieldname === 'reportFile'  ? '.doc/.docx' :
    file.fieldname === 'drawingFile' ? '.pdf' : '.xls/.xlsx';
  cb(new Error(`Invalid file for "${file.fieldname}". Allowed: ${hint}`), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

const handleSurveyUpload = (req, res, next) => {
  upload.fields([
    { name: 'reportFile',  maxCount: 1 },
    { name: 'drawingFile', maxCount: 1 },
    { name: 'boqFile',     maxCount: 1 },
  ])(req, res, (err) => {
    if (err instanceof multer.MulterError)
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    if (err)
      return res.status(400).json({ success: false, error: err.message });
    next();
  });
};

console.log('📋 Registering Lead Routes...');

// ── Utility ──────────────────────────────────────────────────────────
router.post('/process-stale-leads', permissionMiddleware(['admin']), async (req, res) => {
  try {
    const result = await autoMarkStaleLeads();
    if (result.success) {
      return res.status(200).json({ success: true, message: `Marked ${result.markedCount} leads.`, data: result });
    }
    res.status(500).json({ success: false, error: result.error });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET named routes ──────────────────────────────────────────────────
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
    const list = await Employee.find({
      role:    { $in: ['Pre Sales Executive', 'pre sales executive', 'Pre_Sales_Executive'] },
      company: req.user.company || req.user._id,
    }).select('name email department role');
    res.status(200).json({ success: true, employees: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/my-survey-leads', isLoggedIn, async (req, res) => {
  try {
    const user  = req.user;
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
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ✅ NEW: Survey file download route — streams file through Express
//    Works on Render because it reads the file from disk via Node.js fs
//    instead of relying on static file serving which fails on Render.
router.get('/survey-file/:id/:fileType', isLoggedIn, async (req, res) => {
  try {
    const { id, fileType } = req.params;

    if (!['reportFile', 'drawingFile', 'boqFile'].includes(fileType)) {
      return res.status(400).json({ success: false, error: 'Invalid file type.' });
    }

    const lead = await Lead.findById(id)
      .select('surveyReport')
      .lean();

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    const storedPath = lead.surveyReport?.[fileType];
    if (!storedPath) {
      return res.status(404).json({ success: false, error: 'File not uploaded for this lead.' });
    }

    // storedPath = '/uploads/survey-reports/reportFile-xxx.docx'
    // __dirname  = project/routes/
    // absolute   = project/uploads/survey-reports/reportFile-xxx.docx
    const absolutePath = path.join(__dirname, '..', storedPath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found on server. Please re-upload the survey report.'
      });
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mimeMap = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc':  'application/msword',
      '.pdf':  'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls':  'application/vnd.ms-excel',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const fileName    = path.basename(absolutePath);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(absolutePath);
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Error reading file.' });
    });
    stream.pipe(res);

  } catch (error) {
    console.error('Survey file download error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
});

router.get('/employee-leads/:employeeId', permissionMiddleware(['viewLead']), salesManagerController.getManagerTeamLeads);

// ── POST named routes ─────────────────────────────────────────────────
router.post('/call-attempt/:id', isLoggedIn, async (req, res) => {
  try {
    const user   = req.user;
    const leadId = req.params.id;
    const { day, attempt, date, status, remarks, attemptedBy } = req.body;

    if (!Types.ObjectId.isValid(leadId))
      return res.status(400).json({ success: false, error: 'Invalid lead ID.' });

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });
    if (!lead)   return res.status(404).json({ success: false, error: 'Lead not found.' });
    if (!day || !attempt)
      return res.status(400).json({ success: false, error: 'Day and attempt required.' });

    const exists = lead.callHistory.findIndex(c => c.day === day && c.attempt === attempt);
    if (exists !== -1)
      return res.status(400).json({ success: false, error: `Day ${day} - Attempt ${attempt} already recorded.` });

    const isFirst = lead.callHistory.length === 0;
    lead.callHistory.push({ day, attempt, date: date || new Date(), status: status || 'attempted', remarks: remarks || '', attemptedBy: attemptedBy || user._id });
    if (isFirst) lead.firstCallDate = new Date();
    lead.callHistory.sort((a, b) => a.day !== b.day ? a.day - b.day : a.attempt - b.attempt);
    await lead.save();

    const saved = lead.callHistory.find(c => c.day === day && c.attempt === attempt);
    res.status(200).json({ success: true, message: 'Call attempt recorded.', data: saved });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PUT named routes (ALL before /:id) ───────────────────────────────
router.put('/assign/:id',         permissionMiddleware(['assignLead']), leadController.assignLead);
router.put('/reassign/:id',       permissionMiddleware(['updateLead']), leadController.assignLead);
router.put('/transfer-ownership', permissionMiddleware(['updateLead']), leadController.transferOwnership);
router.put('/submit-enquiry/:id', isLoggedIn,                          leadController.submiEnquiry);
router.put('/meeting-log/:id',    isLoggedIn,                          leadController.saveMeetingLog);

// ✅ Survey report upload — BEFORE /:id
router.put('/survey-report/:id', isLoggedIn, handleSurveyUpload, leadController.submitSurveyReport);

// ── Generic /:id — ALWAYS LAST ────────────────────────────────────────
router.get('/',       permissionMiddleware(['viewMarketingDashboard']), leadController.getLeads);
router.post('/',      permissionMiddleware(['createLead']),             leadController.createLead);
router.put('/:id',    permissionMiddleware(['updateLead']),             leadController.updateLead);
router.delete('/:id', permissionMiddleware(['deleteLead']),             leadController.deleteLead);

if (process.env.NODE_ENV !== 'production') {
  router.get('/debug-routes', (req, res) => {
    const routes = [];
    router.stack.forEach(m => {
      if (m.route) routes.push({ path: m.route.path, methods: Object.keys(m.route.methods) });
    });
    res.json({ routes });
  });
}

console.log('✅ All lead routes registered successfully');
module.exports = router;