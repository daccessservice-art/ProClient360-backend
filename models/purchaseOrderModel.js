const mongoose = require('mongoose');

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
  // New fields for terms and conditions
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

// Pre-save hook to generate order number
purchaseOrderSchema.pre('save', async function(next) {
  // Only generate order number if it's not already set
  if (!this.orderNumber) {
    const orderDate = new Date(this.orderDate);
    const currentYear = orderDate.getFullYear();
    const nextYear = currentYear + 1;
    const financialYear = `${currentYear}-${nextYear.toString().slice(-2)}`;
    
    // Calculate financial year start and end dates
    let startOfYear, endOfYear;
    
    // Financial year starts from April 1st
    if (orderDate.getMonth() >= 3) { // Month is 3-based (0=Jan, 3=Apr)
      startOfYear = new Date(currentYear, 3, 1); // April 1st of current year
      endOfYear = new Date(nextYear, 2, 31); // March 31st of next year
    } else {
      startOfYear = new Date(currentYear - 1, 3, 1); // April 1st of previous year
      endOfYear = new Date(currentYear, 2, 31); // March 31st of current year
    }
    
    try {
      // Count existing orders for this financial year
      const count = await mongoose.model('PurchaseOrder').countDocuments({
        orderDate: {
          $gte: startOfYear,
          $lte: endOfYear
        },
        company: this.company // Ensure count is per company
      });
      
      // Generate serial number with leading zeros
      const serialNumber = String(count + 1).padStart(3, '0');
      this.orderNumber = `DA/${financialYear}/${serialNumber}`;
    } catch (error) {
      console.error('Error generating order number:', error);
      // Fallback to timestamp if there's an error
      this.orderNumber = `DA/${financialYear}/${Date.now().toString().slice(-6)}`;
    }
  }
  next();
});

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;