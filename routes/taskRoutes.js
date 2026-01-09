const express = require('express');
const router= express.Router();

const taskController= require('../controllers/taskController');
const { permissionMiddleware } = require('../middlewares/auth');


router.get('/',permissionMiddleware(['viewTask']), taskController.showAll);

router.post('/',permissionMiddleware(['createTask']),taskController.create);

router.put('/:id', permissionMiddleware(['updateTask']), taskController.update);

router.delete('/:id',permissionMiddleware(['deleteTask']), taskController.delete);

module.exports= router;