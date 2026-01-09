const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createMRF, updateMRF, deleteMRF, getMRF
} = require('../controllers/mrfController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewMRF']), showAll);
router.get('/:id', permissionMiddleware(['viewMRF']), getMRF);
router.post('/', permissionMiddleware(['createMRF']), createMRF);
router.put('/:id', permissionMiddleware(['updateMRF']), updateMRF);
router.delete('/:id', permissionMiddleware(['deleteMRF']), deleteMRF);

module.exports = router;