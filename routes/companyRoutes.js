const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { isAdmin, isCompany } = require('../middlewares/auth');
const comDashbordController = require('../controllers/comDashbordController');
const upload = require('../middlewares/fileUpload');
const { updateLeadConfig, getLeadConfig } = require('../controllers/leadConfigController');


router.get('/',isAdmin, companyController.showAll);

// router.get('/:id', isAdmin, companyController.getCompany);

router.post('/',isAdmin, upload.none(), companyController.createCompany);

router.get('/dashboard', isCompany,comDashbordController.dashboard );

router.put('/lead-config', isCompany, updateLeadConfig);

router.put('/:id',isAdmin, companyController.updateCompany);

router.delete('/:id',isAdmin, companyController.deleteCompany);

router.get('/lead-config', isCompany, getLeadConfig);

module.exports = router;