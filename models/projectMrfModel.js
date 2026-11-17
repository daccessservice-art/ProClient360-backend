const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Project MRF (Material Requisition Form) raised from Project Master.
// Separate from the existing /api/mrf (MRF Master) collection so nothing
// there changes.
//
// Stock rule: when an MRF is saved, for every item linked to Product Master
//   issuedQty   = min(stock, requiredQty)   → deducted from currentStockQty
//   shortageQty = requiredQty - issuedQty    → what the store must arrange
// Updating an MRF first returns the old issuedQty to stock, then re-issues.
// Deleting an MRF returns the issuedQty to stock.
// ─────────────────────────────────────────────────────────────────────────────

const AVAILABILITY = ['Available', 'Partial', 'Not Available', 'Not in Product Master'];
const RESPONSIBILITY = ['', 'Customer', 'YourSelf'];

const mrfItemSchema = new mongoose.Schema({
    srNo: { type: Number },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, trim: true, maxlength: 200, default: '' },
    brandName: { type: String, trim: true, maxlength: 100, default: '' },
    modelNo: { type: String, trim: true, maxlength: 100, default: '' },
    materialDescription: { type: String, trim: true, maxlength: 2000, default: '' },
    unit: { type: String, trim: true, maxlength: 50, default: 'No.' },
    rate: { type: Number, default: 0, min: 0 },
    requiredQty: { type: Number, required: true, min: [1, 'Quantity must be at least 1'] },
    stockAtRequest: { type: Number, default: 0 },   // stock just before this MRF issued from it
    issuedQty: { type: Number, default: 0, min: 0 }, // deducted from Product Master
    shortageQty: { type: Number, default: 0, min: 0 },
    availabilityStatus: { type: String, enum: AVAILABILITY, default: 'Not in Product Master' },
    remark: { type: String, trim: true, maxlength: 1000, default: '' },
});

const contactSchema = new mongoose.Schema({
    name: { type: String, trim: true, maxlength: 100, default: '' },
    contact: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
}, { _id: false });

const historySchema = new mongoose.Schema({
    action: { type: String, required: true },    // Created / Updated / Sent to Store
    by: { type: mongoose.Schema.Types.ObjectId },
    byName: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
}, { _id: false });

const projectMrfSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },

    mrfNo: { type: String, required: [true, 'MRF No is required'], trim: true, maxlength: 50 },
    mrfDate: { type: Date, required: true, default: Date.now },
    nameOfSite: { type: String, trim: true, maxlength: 200, default: '' },
    supplyType: { type: String, enum: ['Project', 'Supply'], default: 'Project' },
    customerPONo: { type: String, trim: true, default: '' },
    billingAddress: { type: String, trim: true, maxlength: 1000, default: '' },

    contacts: {
        store: { type: contactSchema, default: () => ({}) },
        project: { type: contactSchema, default: () => ({}) },
        accounts: { type: contactSchema, default: () => ({}) },
    },

    items: {
        type: [mrfItemSchema],
        validate: [(v) => Array.isArray(v) && v.length > 0, 'At least one material item is required'],
    },

    momDescription: { type: String, trim: true, maxlength: 2000, default: '' },

    // ✅ NEW: full Scope of Works table — each point with Yourself / Customer text
    scopeItems: {
        type: [new mongoose.Schema({
            item: { type: String, trim: true, required: true, maxlength: 200 },
            yourself: { type: String, trim: true, maxlength: 200, default: '' },
            customer: { type: String, trim: true, maxlength: 200, default: '' },
        }, { _id: false })],
        default: [],
    },

    // Old 4-radio format (kept so MRFs saved earlier still open correctly)
    scopeOfWorks: {
        cablingWarranty: { type: String, enum: RESPONSIBILITY, default: '' },
        civilWarranty: { type: String, enum: RESPONSIBILITY, default: '' },
        chimbyPicksLadder: { type: String, enum: RESPONSIBILITY, default: '' },
        fabricationWarranty: { type: String, enum: RESPONSIBILITY, default: '' },
    },

    materialStatus: { type: String, enum: ['All Available', 'Partial', 'Not Available'], default: 'All Available' },
    shortageItemCount: { type: Number, default: 0 },

    status: { type: String, enum: ['Saved', 'Sent'], default: 'Saved' },
    sentAt: { type: Date },
    sentByName: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId },
    createdByName: { type: String, default: '' },
    updatedByName: { type: String, default: '' },

    history: { type: [historySchema], default: [] },
}, { timestamps: true });

// MRF No is unique inside one company
projectMrfSchema.index({ company: 1, mrfNo: 1 }, { unique: true });

module.exports = mongoose.model('ProjectMRF', projectMrfSchema);
module.exports.AVAILABILITY = AVAILABILITY;
module.exports.RESPONSIBILITY = RESPONSIBILITY;