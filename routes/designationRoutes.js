const express = require('express');
const router = express.Router();
const designationController = require("../controllers/designationController");
const { permissionMiddleware } = require('../middlewares/auth');

router.get('/Alldesignations', permissionMiddleware(['viewDesignation']), designationController.showAll);

router.get('/', permissionMiddleware(['viewDesignation']), designationController.getDesignation);

router.post('/',permissionMiddleware(['createDesignation']), designationController.create);

router.put('/:id',permissionMiddleware(['updateDesignation']), designationController.update);

router.delete('/:id',permissionMiddleware(['deleteDesignation']), designationController.delete);

module.exports= router;