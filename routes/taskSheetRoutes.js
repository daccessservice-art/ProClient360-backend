const express = require('express');
const router = express.Router();

const taskSheetController = require('../controllers/taskSheetController');
const { permissionMiddleware, isEmployee, isLoggedIn } = require('../middlewares/auth');

// Get all task sheets
router.get('/', permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

// ✅ FIXED: /my/:projectId ABOVE /:id + isEmployee middleware
router.get('/my/:projectId', isEmployee, taskSheetController.myTask);

// ✅ FIXED: isLoggedIn so project employees can access /:id on mobile
router.get('/:id', isLoggedIn, taskSheetController.getTaskSheet);

// Create new task sheet
router.post('/', permissionMiddleware(['createTaskSheet']), taskSheetController.create);

// Update task sheet
router.put('/:id', permissionMiddleware(['updateTaskSheet']), taskSheetController.update);

// Delete task sheet
router.delete('/:id', permissionMiddleware(['deleteTaskSheet']), taskSheetController.delete);

module.exports = router;