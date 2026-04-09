const express = require('express');
const router = express.Router();

const taskSheetController = require('../controllers/taskSheetController');
const { permissionMiddleware, isEmployee } = require('../middlewares/auth');

// Get all task sheets
router.get('/', permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

// ✅ FIX: moved above /:id AND changed to isEmployee (no permission needed)
router.get('/my/:projectId', isEmployee, taskSheetController.myTask);

// Dynamic route AFTER /my/:projectId
router.get('/:id', permissionMiddleware(['viewTaskSheet']), taskSheetController.getTaskSheet);

// Create new task sheet
router.post('/', permissionMiddleware(['createTaskSheet']), taskSheetController.create);

// Update task sheet
router.put('/:id', permissionMiddleware(['updateTaskSheet']), taskSheetController.update);

// Delete task sheet
router.delete('/:id', permissionMiddleware(['deleteTaskSheet']), taskSheetController.delete);

module.exports = router;