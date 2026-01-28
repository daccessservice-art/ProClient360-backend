const express = require('express');
const router = express.Router();

const taskSheetController = require('../controllers/taskSheetController');
const { permissionMiddleware } = require('../middlewares/auth');

// Get all task sheets
router.get('/', permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

// Get task sheet by project ID
router.get('/:id', permissionMiddleware(['viewTaskSheet']), taskSheetController.getTaskSheet);

// Get my tasks for a project
router.get('/my/:projectId', permissionMiddleware(['viewTaskSheet']), taskSheetController.myTask);

// Create new task sheet
router.post('/', permissionMiddleware(['createTaskSheet']), taskSheetController.create);

// Update task sheet
router.put('/:id', permissionMiddleware(['updateTaskSheet']), taskSheetController.update);

// Delete task sheet
router.delete('/:id', permissionMiddleware(['deleteTaskSheet']), taskSheetController.delete);

module.exports = router;