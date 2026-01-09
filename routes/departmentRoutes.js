const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { isCompany, permissionMiddleware } = require('../middlewares/auth');

router.get('/', permissionMiddleware(['viewDepartment']), departmentController.showAll);

router.post('/', permissionMiddleware(['createDepartment']), departmentController.create);

router.put('/:id', permissionMiddleware(['updateDepartment']), departmentController.update);

router.delete('/:id', permissionMiddleware(['deleteDepartment']), departmentController.delete);

module.exports = router;