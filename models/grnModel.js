const mongoose = require('mongoose');

// Counter schema embedded in the GRN model file
const counterSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  financialYear: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness per company per financial year
counterSchema.index({ company: 1, financialYear: 1 }, { unique: true });

const Counter = mongoose.model('Counter', counterSchema);

const grnItemSchema = new mongoose.Schema({
  brandName: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
  },
  modelNo: {
    type: String,
    required: [true, 'Model number is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
  },
  orderedQuantity: {
    type: Number,
    required: [true, 'Ordered quantity is required'],
    min: [0, 'Ordered quantity cannot be negative'],
  },
  receivedQuantity: {
    type: Number,
    required: [true, 'Received quantity is required'],
    min: [0, 'Received quantity cannot be negative'],
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
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
    required: [true, 'Net value is required'],
  },
});

const grnSchema = new mongoose.Schema({
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
  grnNumber: {
    type: String,
    unique: true,
    trim: true,
  },
  grnDate: {
    type: Date,
    required: [true, 'GRN date is required'],
  },
  choice: {
    type: String,
    required: [true, 'Choice is required'],
    enum: {
      values: ['Against PO', 'Direct Material'],
      message: 'Choice must be either Against PO or Direct Material',
    },
  },
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: function() {
      return this.choice === 'Against PO';
    },
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: [true, 'Vendor is required'],
  },
  transactionType: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: ['B2B', 'SEZ', 'Import', 'Asset'],
      message: 'Transaction type must be one of: B2B, SEZ, Import, Asset',
    },
  },
  purchaseType: {
    type: String,
    required: [true, 'Purchase type is required'],
    enum: {
      values: ['Project Purchase', 'Stock'],
      message: 'Purchase type must be either Project Purchase or Stock',
    },
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: function() {
      return this.purchaseType === 'Project Purchase';
    },
  },
  warehouseLocation: {
    type: String,
    trim: true,
    maxlength: [200, 'Warehouse location cannot exceed 200 characters'],
    required: function() {
      return this.purchaseType === 'Stock';
    },
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
    type: [grnItemSchema],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'At least one item is required',
    },
  },
  remark: {
    type: String,
    trim: true,
    maxlength: [1000, 'Remark cannot exceed 1000 characters'],
  },
  attachments: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
}, {
  timestamps: true,
});

// Helper function to get financial year
function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  if (month >= 3) { // April onwards
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// Static method to generate unique GRN number
grnSchema.statics.generateGRNNumber = async function(companyId, grnDate) {
  const financialYear = getFinancialYear(grnDate);
  
  // Use findOneAndUpdate with atomic operations
  const counter = await Counter.findOneAndUpdate(
    { company: companyId, financialYear },
    { $inc: { sequence: 1 } },
    { 
      new: true, 
      upsert: true,
      setDefaultsOnInsert: true 
    }
  );
  
  const formattedSerial = String(counter.sequence).padStart(3, '0');
  return `GRN/${financialYear}/${formattedSerial}`;
};

// Export both models
const GRN = mongoose.model('GRN', grnSchema);

module.exports = { GRN, Counter };