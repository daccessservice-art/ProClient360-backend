const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const {permissionMiddleware, isLoggedIn} = require('../middlewares/auth');


router.get('/dashboard',isLoggedIn, employeeController.dashboard);

router.get('/',permissionMiddleware(['viewEmployee']),employeeController.showAll);

// ✅ FIXED: Changed from viewEmployee to isLoggedIn - so all logged-in users can access for dropdowns
router.get('/all', isLoggedIn, employeeController.getAllEmployees);

router.get('/dropdown', isLoggedIn, employeeController.getEmployeesForDropdown); // ✅ NEW: Lightweight dropdown endpoint

router.get('/search',permissionMiddleware(['viewEmployee']), employeeController.search);

router.post('/', permissionMiddleware(['createEmployee']),employeeController.create);

router.delete('/:id', permissionMiddleware(['deleteEmployee']), employeeController.deleteEmployee);

router.put('/:id', permissionMiddleware(['updateEmployee']), employeeController.updateEmployee);   

router.get('/:id', permissionMiddleware(['viewEmployee']), employeeController.getEmployee);

// ========== NEW: Survey Engineers Endpoint ==========
// Get all employees with survey engineer role - accessible to logged-in users
router.get('/survey-engineers', isLoggedIn, async (req, res) => {
  try {
    const Employee = require('../models/employeeModel');
    const surveyEngineers = await Employee.find({ 
      role: { $in: ['Pre Sales Executive', 'pre sales executive', 'Pre_Sales_Executive'] },
      company: req.user.company || req.user._id
    }).select('name email department role');
    
    console.log('Found survey engineers:', surveyEngineers.length);
    
    res.status(200).json({ 
      success: true, 
      employees: surveyEngineers,
      count: surveyEngineers.length
    });
  } catch (error) {
    console.error('Error fetching survey engineers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;