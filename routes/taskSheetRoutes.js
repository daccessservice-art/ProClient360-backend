const express = require('express');
const router = express.Router();

const taskSheetController = require('../controllers/taskSheetController');
const { permissionMiddleware, isEmployee, isLoggedIn } = require('../middlewares/auth');

// ─── Get all task sheets (Manager) ───────────────────────────────────────────
router.get('/', permissionMiddleware(['viewTaskSheet']), taskSheetController.showAll);

// ─── /my/:projectId  MUST be above /:id ──────────────────────────────────────
router.get('/my/:projectId', isEmployee, taskSheetController.myTask);

// ─── Tester's own testing queue — MUST be above /:id too ─────────────────────
router.get('/tester/my-tasks', isEmployee, taskSheetController.getTesterTasks);

// ─── Employee updates only subtask name ──────────────────────────────────────
router.patch('/update-subtask/:id', isEmployee, taskSheetController.updateSubtask);

// ─── Team Lead creates a sub-task under one of their own tasks ───────────────
router.post('/subtask', isEmployee, taskSheetController.createSubTask);

// ─── Get all sub-tasks for a parent task (for Manager's expanded view) ───────
router.get('/subtasks/:parentId', isLoggedIn, taskSheetController.getSubTasksForParent);

// ─── Developer submits their 100%-complete work for testing ──────────────────
// (also lets the developer pick their own tester if Manager didn't assign one)
router.post('/:id/submit-for-testing', isEmployee, taskSheetController.submitForTesting);

// ─── NEW: Tester updates their in-progress testing % (no final verdict yet) ──
router.put('/:id/test-progress', isEmployee, taskSheetController.updateTestProgress);

// ─── Tester marks Pass / reports a Bug on a task ──────────────────────────────
router.post('/:id/test-result', isEmployee, taskSheetController.submitTestResult);

// ─── Manager (re)assigns a tester on an existing task ─────────────────────────
router.put('/:id/assign-tester', permissionMiddleware(['updateTaskSheet']), taskSheetController.assignTester);

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