const mongoose = require('mongoose');

const projectPurchaseSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: [true, 'Project ID is required']
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    requestDate: {
        type: Date,
        default: Date.now
    },
    materials: [{
        productName: {
            type: String,
            required: [true, 'Product name is required'],
            trim: true,
            maxlength: 200
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500
        },
        quantity: {
            type: Number,
            required: [true, 'Quantity is required'],
            min: [1, 'Quantity must be at least 1']
        },
        unit: {
            type: String,
            default: 'Nos',
            maxlength: 20
        },
        estimatedPrice: {
            type: Number,
            default: 0,
            min: 0
        },
        // ─── Store Team Check ─────────────────────
        stockStatus: {
            type: String,
            enum: ['Pending', 'Available', 'Not Available', 'Partial'],
            default: 'Pending'
        },
        availableQuantity: {
            type: Number,
            default: 0,
            min: 0
        },
        stockCheckedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        stockCheckedDate: {
            type: Date
        },
        stockRemark: {
            type: String,
            maxlength: 500
        },
        // ─── Purchase Info (if not available) ──────
        purchaseRequired: {
            type: Boolean,
            default: false
        },
        purchaseStatus: {
            type: String,
            enum: ['Not Required', 'Pending', 'Ordered', 'Partially Delivered', 'Delivered'],
            default: 'Not Required'
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor'
        },
        purchaseOrderRef: {
            type: String,
            maxlength: 200
        },
        purchaseDate: {
            type: Date
        },
        expectedDeliveryDate: {
            type: Date
        },
        actualDeliveryDate: {
            type: Date
        },
        purchaseRemark: {
            type: String,
            maxlength: 500
        }
    }],
    // ─── Payment Terms Snapshot from Project (READ-ONLY) ───
    paymentTerms: {
        advancePay: { type: Number, default: 0 },
        payAgainstDelivery: { type: Number, default: 0 },
        payAfterCompletion: { type: Number, default: 0 },
        retention: { type: Number, default: 0 }
    },
    // ─── Account Verification ──────────────────────
    accountVerification: {
        advancePaymentReceived: {
            type: Boolean,
            default: false
        },
        advancePaymentAmount: {
            type: Number,
            default: 0
        },
        advancePaymentDate: {
            type: Date
        },
        advancePaymentVerifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        advancePaymentRemark: {
            type: String,
            maxlength: 500
        },
        invoiceGenerated: {
            type: Boolean,
            default: false
        },
        invoiceNumber: {
            type: String
        },
        invoiceDate: {
            type: Date
        },
        invoicePdf: {
            type: String
        },
        paymentTermsMatch: {
            type: String,
            enum: ['Pending', 'Matched', 'Not Matched', 'Partial'],
            default: 'Pending'
        },
        accountRemark: {
            type: String,
            maxlength: 1000
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        verifiedDate: {
            type: Date
        }
    },
    // ─── Overall Status ───────────────────────────
    status: {
        type: String,
        enum: [
            'Draft',
            'Store Check Pending',
            'Store Verified - Available',
            'Store Verified - Not Available',
            'Purchase Pending',
            'Purchase Ordered',
            'Purchase Delivered',
            'Ready for Invoice',
            'Invoice Generated',
            'Completed'
        ],
        default: 'Draft'
    },
    remark: {
        type: String,
        maxlength: 1000
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    }
}, {
    timestamps: true
});

projectPurchaseSchema.index({ projectId: 1 });
projectPurchaseSchema.index({ company: 1 });
projectPurchaseSchema.index({ status: 1 });
projectPurchaseSchema.index({ 'materials.stockStatus': 1 });
projectPurchaseSchema.index({ 'accountVerification.paymentTermsMatch': 1 });

const ProjectPurchase = mongoose.model('ProjectPurchase', projectPurchaseSchema);

module.exports = ProjectPurchase;