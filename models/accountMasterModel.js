const mongoose = require('mongoose');

const accountMasterSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        unique: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    
    // Project Information (Auto-fetched from Project Master)
    customerName: {
        type: String
    },
    projectName: {
        type: String
    },
    poNumber: {
        type: String
    },
    product: {
        type: String
    },
    paymentTerms: {
        advancePay: { type: Number, default: 0 },
        payAgainstDelivery: { type: Number, default: 0 },
        payAfterCompletion: { type: Number, default: 0 },
        retention: { type: Number, default: 0 }
    },
    basicAmount: {
        type: Number,
        required: true,
        min: [0, 'Basic amount cannot be negative']
    },
    
    // Delivery Status (Auto-fetched from Delivery/GRN)
    deliveryStatus: {
        materialDeliveredPercentage: { type: Number, default: 0 },
        pendingMaterial: { type: String, default: 'N/A' },
        deliveryCompletedDate: { type: Date }
    },
    
    // Installation Status (Auto-fetched from Task Sheet)
    installationStatus: {
        workCompletedPercentage: { type: Number, default: 0 },
        pendingWork: { type: String, default: 'N/A' },
        installationStatus: { 
            type: String, 
            enum: ['Not Started', 'In Progress', 'Completed', 'Pending'],
            default: 'Not Started'
        }
    },
    
    // Account Actions (Editable by Accounts Team)
    accountActions: {
        advancePaymentReceived: { type: Number, default: 0 },
        receivedAmount: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        totalInvoiceAmount: { type: Number, default: 0 },
        pendingAmount: { type: Number, default: 0 },
        invoiceStatus: {
            type: String,
            enum: ['Pending', 'Partial', 'Paid', 'Overdue'],
            default: 'Pending'
        },
        invoiceNumber: { type: String },
        invoiceDate: { type: Date },
        invoicePdf: { type: String },
        nextFollowUpDate: { type: Date },
        customerPaymentRemark: { type: String, maxlength: 1000 },
        lastFollowUpDate: { type: Date }
    },
    
    // Invoice History
    invoiceHistory: [{
        invoiceNumber: String,
        invoiceDate: Date,
        invoiceAmount: Number,
        taxAmount: Number,
        totalAmount: Number,
        invoicePdf: String,
        status: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    // Follow-up History
    followUpHistory: [{
        followUpDate: Date,
        nextFollowUpDate: Date,
        remark: String,
        contactPerson: String,
        createdAt: { type: Date, default: Date.now }
    }],
    
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    }
}, {
    timestamps: true
});

// Index for faster queries
accountMasterSchema.index({ projectId: 1 }, { unique: true });
accountMasterSchema.index({ company: 1 });
accountMasterSchema.index({ 'accountActions.invoiceStatus': 1 });
accountMasterSchema.index({ 'accountActions.nextFollowUpDate': 1 });

const AccountMaster = mongoose.model('AccountMaster', accountMasterSchema);

module.exports = AccountMaster;