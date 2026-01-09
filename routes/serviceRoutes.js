const express = require('express');
const router= express.Router();

const serviceController = require('../controllers/serviceController');
const {permissionMiddleware, isLoggedIn}= require('../middlewares/auth');

router.get('/', permissionMiddleware(['viewService']), serviceController.showAll);

router.get('/myService',isLoggedIn, serviceController.myServices);

router.post('/',permissionMiddleware(["createService"]) ,serviceController.create);

router.put('/:id',permissionMiddleware(["updateService"]), serviceController.update);

router.delete('/:id', permissionMiddleware(["deleteService"]), serviceController.delete);

module.exports= router;