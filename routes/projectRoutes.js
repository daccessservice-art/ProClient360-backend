const express = require("express");
const router = express.Router();
const projectController = require('../controllers/projectController');
const {permissionMiddleware, isLoggedIn, isEmployee, } = require("../middlewares/auth");
const upload = require('../middlewares/fileUpload');

router.get('/', isLoggedIn, projectController.showAll);

router.get('/my',isEmployee, projectController.myProjects);


router.get('/search',permissionMiddleware(['viewProject']), projectController.search);

// router.get('/export-pdf', projectController.exportProjects);

router.post('/', permissionMiddleware(['createProject']), projectController.create);

router.get('/:id', permissionMiddleware(['viewProject']), projectController.getProject);

router.put('/:id', permissionMiddleware(['updateProject']), projectController.updateProject);

router.delete('/:id', permissionMiddleware(['deleteProject']), projectController.delete);


module.exports = router;