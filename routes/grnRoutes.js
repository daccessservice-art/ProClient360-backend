const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
  showAll, 
  createGRN, 
  updateGRN, 
  deleteGRN, 
  getGRN,
  getGRNByNumber,
  getGRNNumbers,
  createGRNWithDocument,
  updateGRNWithDocument
} = require('../controllers/grnController');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = 'uploads/grn';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage for GRN documents
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer with file size limit and file filter
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and image files are allowed.'), false);
    }
  }
});

router.get('/', permissionMiddleware(['viewGRN']), showAll);

router.get('/numbers', permissionMiddleware(['viewGRN']), getGRNNumbers);

router.get('/number/:grnNumber', permissionMiddleware(['viewGRN']), getGRNByNumber);

router.get('/:id', permissionMiddleware(['viewGRN']), getGRN);

router.post('/with-document', permissionMiddleware(['createGRN']), upload.single('file'), createGRNWithDocument);

router.put('/with-document/:id', permissionMiddleware(['updateGRN']), upload.single('file'), updateGRNWithDocument);

router.post('/', permissionMiddleware(['createGRN']), createGRN);

router.put('/:id', permissionMiddleware(['updateGRN']), updateGRN);

router.delete('/:id', permissionMiddleware(['deleteGRN']), deleteGRN);

module.exports = router;