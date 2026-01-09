const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const {isAdmin} = require('../middlewares/auth');

router.get('/', isAdmin, adminController.getAdmin);

router.get('/dashboard', isAdmin, adminController.dashboard);

// router.get('/active',isAdmin, adminController.active);

// router.get('/inactive', isAdmin, adminController.inactive);

router.post('/',isAdmin, adminController.admin);

router.delete('/:id',isAdmin,adminController.deleteAdmin);

router.put('/:id', isAdmin, adminController.update);

module.exports=router;