const express = require('express');
const router = express.Router();

const taskSheetController = require('../controllers/taskSheetController');
const { permissionMiddleware, isEmployee, isLoggedIn } = require('../middlewares/auth');

// ─── Get all task sheets (Manager) ───────────────────────────────────────────
router.get('/', permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

// ─── /my/:projectId  MUST be above /:id ──────────────────────────────────────
router.get('/my/:projectId', isEmployee, taskSheetController.myTask);

// ─── Employee updates only subtask name ──────────────────────────────────────
router.patch('/update-subtask/:id', isEmployee, taskSheetController.updateSubtask);

// ─── NEW: Team Lead creates a sub-task under one of their own tasks ───────────
// isEmployee covers both employees and team leads (they are all employees)
router.post('/subtask', isEmployee, taskSheetController.createSubTask);

// ─── NEW: Get all sub-tasks for a parent task (for Manager's expanded view) ───
router.get('/subtasks/:parentId', isLoggedIn, taskSheetController.getSubTasksForParent);

// ─── Get single task sheet (isLoggedIn so project employees can access) ───────
router.get('/:id', isLoggedIn, taskSheetController.getTaskSheet);

// ─── Manager creates a new task sheet ────────────────────────────────────────
router.post('/', permissionMiddleware(['createTaskSheet']), taskSheetController.create);

// ─── Task completion notification ────────────────────────────────────────────
router.post('/notify-completion', isLoggedIn, taskSheetController.notifyCompletion);

// ─── Update task sheet ────────────────────────────────────────────────────────
router.put('/:id', permissionMiddleware(['updateTaskSheet']), taskSheetController.update);

// ─── Delete task sheet ────────────────────────────────────────────────────────
router.delete('/:id', permissionMiddleware(['deleteTaskSheet']), taskSheetController.delete);

module.exports = router;