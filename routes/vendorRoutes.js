const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const {
  showAll,
  createVendor,
  updateVendor,
  deleteVendor,
  getVendor,
  getVendorByName,
  generateVendorLink,
  getVendorLink,
  registerVendorFromLink,
  getVendorTypeCounts
} = require('../controllers/vendorController');

const router = express.Router();

router.get('/', permissionMiddleware(['viewVendor']), showAll);

// ✅ Must come before '/:id'
router.get('/type-counts', permissionMiddleware(['viewVendor']), getVendorTypeCounts);

router.get('/:id', permissionMiddleware(['viewVendor']), getVendor);
router.get('/name/:name', permissionMiddleware(['viewVendor']), getVendorByName);
router.post('/', permissionMiddleware(['createVendor']), createVendor);
router.put('/:id', permissionMiddleware(['updateVendor']), updateVendor);
router.delete('/:id', permissionMiddleware(['deleteVendor']), deleteVendor);

router.post('/generate-link', permissionMiddleware(['createVendor']), generateVendorLink);
router.get('/link/:linkId', getVendorLink);
router.post('/register-from-link', registerVendorFromLink);

module.exports = router;