const express = require('express');
const multer = require('multer');
const { permissionMiddleware } = require('../middlewares/auth');
const {
  importOldAMCHistory,
  showAll,
  deleteOldAMCHistory,
  deleteImportBatch,
  exportOldAMCHistoryExcel,
  exportOldAMCHistoryPDF,
  createOldAMCHistory,
  updateOldAMCHistory,
} = require('../controllers/oldAMCHistoryController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls, or .csv files are allowed'));
  },
});

router.get('/export/pdf', permissionMiddleware(['viewOldAMCHistory']), exportOldAMCHistoryPDF);
router.get('/export/excel', permissionMiddleware(['viewOldAMCHistory']), exportOldAMCHistoryExcel);
router.get('/', permissionMiddleware(['viewOldAMCHistory']), showAll);
router.post('/import', permissionMiddleware(['createOldAMCHistory']), upload.single('file'), importOldAMCHistory);
router.post('/', permissionMiddleware(['createOldAMCHistory']), createOldAMCHistory);
router.put('/:id', permissionMiddleware(['updateOldAMCHistory']), updateOldAMCHistory);
router.delete('/batch/:batch', permissionMiddleware(['deleteOldAMCHistory']), deleteImportBatch);
router.delete('/:id', permissionMiddleware(['deleteOldAMCHistory']), deleteOldAMCHistory);

module.exports = router;