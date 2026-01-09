const express = require('express');
const router= express.Router();

const taskSheetController= require('../controllers/taskSheetController');
const { permissionMiddleware } = require('../middlewares/auth');


router.get('/',permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

router.get('/:id', permissionMiddleware(['viewTaskSheet']), taskSheetController.getTaskSheet);

router.get('/my/:projectId',permissionMiddleware(['viewTaskSheet']), taskSheetController.myTask);

router.post('/',permissionMiddleware(['createTaskSheet']),taskSheetController.create);

router.put('/:id', permissionMiddleware(['updateTaskSheet']), taskSheetController.update);

router.delete('/:id',permissionMiddleware(['deleteTaskSheet']), taskSheetController.delete);

module.exports= router;