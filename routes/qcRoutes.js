const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createQualityInspection, updateQualityInspection, deleteQualityInspection, getQualityInspection } = require('../controllers/qualityInspectionController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewQC']), showAll);
router.get('/:id', permissionMiddleware(['viewQC']), getQualityInspection);
router.post('/', permissionMiddleware(['createQC']), createQualityInspection);
router.put('/:id', permissionMiddleware(['updateQC']), updateQualityInspection);
router.delete('/:id', permissionMiddleware(['deleteQC']), deleteQualityInspection);

module.exports = router;