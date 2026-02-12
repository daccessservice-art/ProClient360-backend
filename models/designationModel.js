const { unix } = require('moment');
const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Designation name is required'],
        unique: [true, 'A designation with this name already exists'],
        maxlength: [50, 'Designation name cannot exceed 50 characters'],
        trim: true,
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    },
    permissions: [{
        type: String,
        required: [true, 'Permissions are required'],
        enum: [
            'createCustomer',
            'updateCustomer',
            'deleteCustomer',
            'viewCustomer',

            'viewTask',
            'createTask',
            'updateTask',
            'deleteTask',

            'createProject',
            'updateProject',
            'deleteProject',
            'viewProject',

            'createEmployee',
            'updateEmployee',
            'deleteEmployee',
            'viewEmployee',

            'viewTaskSheet',
            'createTaskSheet',
            'updateTaskSheet',
            'deleteTaskSheet',

            'viewDesignation',
            'createDesignation',
            'updateDesignation',
            'deleteDesignation',

            'viewDepartment',
            'createDepartment',
            'updateDepartment',
            'deleteDepartment',

            'viewService',
            'createService',
            'updateService',
            'deleteService',

            "viewFeedback",
            "createFeedback",
            "updateFeedback",
            "deleteFeedback",

            "viewMarketingDashboard",
            "assignLead",
            "updateMarketing",
            "deleteMarketing",

            "viewLead",
            "createLead",
            "updateLead",
            "deleteLead",

            "viewAnnualReport",
            "createAnnualReport",
            "updateAnnualReport",
            "deleteAnnualReport",

            "viewActivityLog",
            "createActivityLog",
            "updateActivityLog",
            "deleteActivityLog",
    
            "viewAMC",
            "createAMC",
            "updateAMC",
            "deleteAMC",

            "viewInventory",
            "createInventory",
            "updateInventory",
            "deleteInventory",

            
             'createVendor',
             'updateVendor',
             'deleteVendor',
             'viewVendor',

             "viewProduct",
             "createProduct",
             "updateProduct",
             "deleteProduct",

             'createPurchaseOrder',
             'viewPurchaseOrder',
             'updatePurchaseOrder',
             'deletePurchaseOrder',

             'createGRN',
             'viewGRN',
             'updateGRN',
             'deleteGRN',

             'createQC',
             'viewQC',
             'updateQC',
             'deleteQC',

             'createDC',
             'viewDC',
             'updateDC',
             'deleteDC', 

            'createMRF',
            'viewMRF',
            'updateMRF',
            'deleteMRF',

            'viewSalesManagerMaster',
            'createSalesManagerMaster',
            'updateSalesManagerMaster',
            'deleteSalesManagerMaster'
        ],
    }]

}, {
    timestamps: true,
});

const Designation = mongoose.model('Designation', designationSchema);

module.exports = Designation; 