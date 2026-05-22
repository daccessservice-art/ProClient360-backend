const express = require('express');
const router = express.Router();
const projectPurchaseController = require('../controllers/projectPurchaseController');
const { permissionMiddleware, isLoggedIn } = require('../middlewares/auth');

router.use(isLoggedIn);

// Get Stats
router.get('/stats',
    permissionMiddleware(['viewProjectPurchase']),
    projectPurchaseController.getStats
);

// Get Material Status by Project (for Account Master integration)
router.get('/project-materials/:projectId',
    permissionMiddleware(['viewProjectPurchase', 'viewAccountMaster']),
    projectPurchaseController.getMaterialStatusByProject
);

// Get All
router.get('/',
    permissionMiddleware(['viewProjectPurchase']),
    projectPurchaseController.getAll
);

// Create
router.post('/',
    permissionMiddleware(['createProjectPurchase']),
    projectPurchaseController.create
);

// Get One
router.get('/:id',
    permissionMiddleware(['viewProjectPurchase']),
    projectPurchaseController.getOne
);

// Update General
router.put('/:id',
    permissionMiddleware(['updateProjectPurchase']),
    projectPurchaseController.update
);

// Store Team Check
router.put('/:id/store-check',
    permissionMiddleware(['updateProjectPurchase']),
    projectPurchaseController.storeCheck
);

// Purchase Team Update
router.put('/:id/purchase-update',
    permissionMiddleware(['updateProjectPurchase']),
    projectPurchaseController.updatePurchase
);

// Account Team Verify
router.put('/:id/account-verify',
    permissionMiddleware(['updateAccountMaster']),
    projectPurchaseController.accountVerify
);

// Add Materials
router.post('/:id/add-materials',
    permissionMiddleware(['createProjectPurchase']),
    projectPurchaseController.addMaterials
);

// Delete
router.delete('/:id',
    permissionMiddleware(['deleteProjectPurchase']),
    projectPurchaseController.delete
);

module.exports = router;