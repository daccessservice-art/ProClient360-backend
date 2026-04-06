const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const {
  showAllExhibitions,
  getExhibitionById,
  createExhibition,
  updateExhibition,
  deleteExhibition,
  getExhibitionsDropdown,
  showAllVisits,
  createVisit,
  updateVisit,
  deleteVisit,
} = require('../controllers/exhibitionController');

const router = express.Router();

// ─── EXHIBITION MASTER ROUTES ─────────────────────────────────────────────────
router.get('/dropdown', permissionMiddleware(['viewExhibition', 'createExhibitionVisit']), getExhibitionsDropdown);
router.get('/', permissionMiddleware(['viewExhibition']), showAllExhibitions);
router.get('/:id', permissionMiddleware(['viewExhibition']), getExhibitionById);
router.post('/', permissionMiddleware(['createExhibition']), createExhibition);
router.put('/:id', permissionMiddleware(['updateExhibition']), updateExhibition);
router.delete('/:id', permissionMiddleware(['deleteExhibition']), deleteExhibition);

// ─── EXHIBITION VISIT ROUTES ──────────────────────────────────────────────────
router.get('/visits/all', permissionMiddleware(['viewExhibitionVisit']), showAllVisits);
router.post('/visits/create', permissionMiddleware(['createExhibitionVisit']), createVisit);
router.put('/visits/:id', permissionMiddleware(['updateExhibitionVisit']), updateVisit);
router.delete('/visits/:id', permissionMiddleware(['deleteExhibitionVisit']), deleteVisit);

module.exports = router;