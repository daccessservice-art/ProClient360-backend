const express = require('express');
const {permissionMiddleware, isCompany } = require('../middlewares/auth');
const { showAll, createCustomer, updateCustomer, deleteCustomer, getCustomer } = require('../controllers/customerController');
const router = express.Router();



router.get('/', permissionMiddleware(['viewCustomer']), showAll);


router.get('/:id', permissionMiddleware(['viewCustomer']), getCustomer);

router.post('/',permissionMiddleware(['createCustomer']), createCustomer);

router.put('/:id',permissionMiddleware(['updateCustomer']), updateCustomer);

router.delete('/:id', permissionMiddleware(['deleteCustomer']), deleteCustomer);


module.exports=router;
