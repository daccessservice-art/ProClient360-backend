const express = require('express');
const router = express.Router();

const accountMasterController = require('../controllers/accountMasterController');

const { 
    permissionMiddleware, 
    isLoggedIn 
} = require('../middlewares/auth');


// All Routes Require Login

router.use(isLoggedIn);


// Get All Accounts

router.get('/',
    permissionMiddleware(['viewAccountMaster']),
    accountMasterController.getAllAccounts
);

// Get Account Statistics

router.get('/stats',
    permissionMiddleware(['viewAccountMaster']),
    accountMasterController.getAccountStats
);

// Get Follow-Up Alerts

router.get('/alerts',
    permissionMiddleware(['viewAccountMaster']),
    accountMasterController.getFollowUpAlerts
);

// Get Single Account By Project ID

router.get('/project/:projectId',
    permissionMiddleware(['viewAccountMaster']),
    accountMasterController.getAccountByProject
);

// Sync Account With Project

router.put('/sync/:projectId',
    permissionMiddleware(['updateAccountMaster']),
    accountMasterController.syncWithProject
);

// Update Account Actions

router.put('/:id',
    permissionMiddleware(['updateAccountMaster']),
    accountMasterController.updateAccountActions
);

router.post('/bulk-sync',
    permissionMiddleware(['createAccountMaster']),
    accountMasterController.bulkSyncAllProjects
);

// Convert Challan To Invoice

router.post('/:id/convert-to-invoice',
    permissionMiddleware(['updateAccountMaster']),
    accountMasterController.convertToInvoice
);

// Add Follow-Up

router.post('/:id/follow-up',
    permissionMiddleware(['updateAccountMaster']),
    accountMasterController.addFollowUp
);

module.exports = router;
