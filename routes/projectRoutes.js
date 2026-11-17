const express = require("express");
const router = express.Router();
const projectController = require('../controllers/projectController');
const {permissionMiddleware, isLoggedIn, isEmployee, } = require("../middlewares/auth");
const upload = require('../middlewares/fileUpload');

router.get('/', isLoggedIn, projectController.showAll);

router.get('/my',isEmployee, projectController.myProjects);


router.get('/search',permissionMiddleware(['viewProject']), projectController.search);

// ✅ NEW: Project approval (Director Customer Delight only — checked inside controller)
// keep these ABOVE the '/:id' routes
router.get('/approval/pending', isLoggedIn, projectController.pendingApprovals);
router.put('/:id/approve', isLoggedIn, projectController.approveProject);
router.put('/:id/reject', isLoggedIn, projectController.rejectProject);

// router.get('/export-pdf', projectController.exportProjects);

router.post('/', permissionMiddleware(['createProject']), projectController.create);

router.get('/:id', permissionMiddleware(['viewProject']), projectController.getProject);

router.put('/:id', permissionMiddleware(['updateProject']), projectController.updateProject);

router.delete('/:id', permissionMiddleware(['deleteProject']), projectController.delete);


module.exports = router;