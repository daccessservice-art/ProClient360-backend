const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { 
  showAll, 
  createQualityInspection, 
  updateQualityInspection, 
  deleteQualityInspection, 
  getQualityInspection,
  getAssetByQR,
  updateAssetStatus,
  getAllAssets,
  getPublicAssetByAssetId
} = require('../controllers/qualityInspectionController');

const router = express.Router();

// PUBLIC ROUTE - No auth required (Must be at the very top)
router.get('/public/asset/:assetId', getPublicAssetByAssetId);

// Protected routes below
router.get('/', permissionMiddleware(['viewQC']), showAll);
router.get('/assets', permissionMiddleware(['viewQC']), getAllAssets);
router.get('/asset/:qrData', permissionMiddleware(['viewQC']), getAssetByQR);
router.get('/:id', permissionMiddleware(['viewQC']), getQualityInspection);
router.post('/', permissionMiddleware(['createQC']), createQualityInspection);
router.put('/:id', permissionMiddleware(['updateQC']), updateQualityInspection);
router.put('/:qcId/asset/:assetId', permissionMiddleware(['updateQC']), updateAssetStatus);
router.delete('/:id', permissionMiddleware(['deleteQC']), deleteQualityInspection);

module.exports = router;