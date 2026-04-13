const mongoose = require('mongoose');
const POCounter = require('./counterModel');

const purchaseOrderItemSchema = new mongoose.Schema({
  brandName: {
    type: String,
    trim: true,
    maxlength: [200, 'Brand name cannot exceed 200 characters'],
  },
  modelNo: {
    type: String,
    trim: true,
    maxlength: [200, 'Model number cannot exceed 200 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  unit: {
    type: String,
    trim: true,
    maxlength: [50, 'Unit cannot exceed 50 characters'],
    default: 'pcs'
  },
  baseUOM: {
    type: String,
    trim: true,
    maxlength: [50, 'Base UOM cannot exceed 50 characters'],
  },
  quantity: {
    type: Number,
    min: [1, 'Quantity must be at least 1'],
  },
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%'],
  },
  taxPercent: {
    type: Number,
    default: 0,
    min: [0, 'Tax cannot be negative'],
    max: [100, 'Tax cannot exceed 100%'],
  },
  netValue: {
    type: Number,
  },
});

const purchaseOrderSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
  },
  orderDate: {
    type: Date,
  },
  orderNumber: {
    type: String,
    unique: true,
    trim: true,
    maxlength: [100, 'Order number cannot exceed 100 characters'],
  },
  transactionType: {
    type: String,
    enum: {
      values: ['B2B', 'SEZ', 'Import', 'Asset'],
      message: 'Transaction type must be one of: B2B, SEZ, Import, Asset',
    },
  },
  purchaseType: {
    type: String,
    enum: {
      values: ['Project Purchase', 'Stock'],
      message: 'Purchase type must be either Project Purchase or Stock',
    },
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
  },
  warehouseLocation: {
    type: String,
    trim: true,
    maxlength: [200, 'Warehouse location cannot exceed 200 characters'],
  },
  deliveryAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Delivery address cannot exceed 500 characters'],
  },
  location: {
    type: String,
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters'],
  },
  items: {
    type: [purchaseOrderItemSchema],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'At least one item is required',
    },
  },
  totalAmount: {
    type: Number,
    min: [0, 'Total amount cannot be negative'],
  },
  totalTax: {
    type: Number,
    min: [0, 'Total tax cannot be negative'],
  },
  grandTotal: {
    type: Number,
    min: [0, 'Grand total cannot be negative'],
  },
  remark: {
    type: String,
    trim: true,
    maxlength: [1000, 'Remark cannot exceed 1000 characters'],
  },
  attachments: [{
    type: String,
    trim: true,
  }],
  paymentTerms: {
    advance: {
      type: Number,
      min: [0, 'Advance percentage cannot be negative'],
      max: [100, 'Advance percentage cannot exceed 100%'],
      default: 0,
    },
    payAgainstDelivery: {
      type: Number,
      min: [0, 'Pay against delivery percentage cannot be negative'],
      max: [100, 'Pay against delivery percentage cannot exceed 100%'],
      default: 0,
    },
    payAfterCompletion: {
      type: Number,
      min: [0, 'Pay after completion percentage cannot be negative'],
      max: [100, 'Pay after completion percentage cannot exceed 100%'],
      default: 0,
    },
    creditPeriod: {
      type: Number,
      min: [0, 'Credit period cannot be negative'],
      default: 0,
    },
  },
  deliveryDate: {
    type: Date,
  },
  materialFollowupDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Partially Received', 'Received', 'Cancelled'],
    default: 'Pending',
  },
}, {
  timestamps: true,
});

purchaseOrderSchema.pre('save', async function (next) {
  if (this.orderNumber) return next();

  try {
    const orderDate = new Date(this.orderDate);
    const month = orderDate.getMonth();

    const fyStart = month >= 3 ? orderDate.getFullYear() : orderDate.getFullYear() - 1;
    const fyEnd   = fyStart + 1;
    const financialYear = `${fyStart}-${String(fyEnd).slice(-2)}`;

    const counterKey = `PO_${financialYear}_${this.company}`;

    const counter = await POCounter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.orderNumber = `DA/${financialYear}/${String(counter.seq).padStart(3, '0')}`;
    return next();
  } catch (error) {
    console.error('Error generating order number:', error);
    this.orderNumber = `DA/FALLBACK/${Date.now().toString().slice(-6)}`;
    return next();
  }
});

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;