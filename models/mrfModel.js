const mongoose = require('mongoose');

const mrfItemSchema = new mongoose.Schema({
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
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
    default: 'No.'
  },
  rate: {
    type: Number,
    required: [true, 'Rate is required'],
    min: [0, 'Rate must be a positive number'],
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount must be a positive number'],
  },
  tax: {
    type: Number,
    default: 0,
    min: [0, 'Tax must be a positive number'],
  },
  total: {
    type: Number,
    required: [true, 'Total is required'],
    min: [0, 'Total must be a positive number'],
  },
  remark: {
    type: String,
    trim: true,
    maxlength: [500, 'Remark cannot exceed 500 characters'],
  }
});

const mrfSchema = new mongoose.Schema({
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
  mrfNumber: {
    type: String,
    unique: true,
    trim: true,
  },
  choice: {
    type: String,
    required: [true, 'Choice is required'],
    enum: {
      values: ['MRF Material Request', 'returnable MRF', 'Rejected returnable MRF', 'scrap MRF'],
      message: 'Invalid choice selected',
    },
  },
  poNumber: {
    type: String,
    trim: true,
  },
  projectPurchaseOrderNumber: {
    type: String,
    trim: true,
  },
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required'],
  },
  mrfDate: {
    type: Date,
    required: [true, 'MRF date is required'],
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
  deliveryPersonName: {
    type: String,
    trim: true,
    maxlength: [100, 'Delivery person name cannot exceed 100 characters'],
  },
  deliveryContactNo: {
    type: String,
    trim: true,
    maxlength: [20, 'Delivery contact number cannot exceed 20 characters'],
  },
  deliveryEmail: {
    type: String,
    trim: true,
    maxlength: [100, 'Delivery email cannot exceed 100 characters'],
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: {
      values: ['supply only', 'project'],
      message: 'Type must be either supply only or project',
    },
  },
  items: {
    type: [mrfItemSchema],
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
    url: {
      type: String,
      required: true
    }
  }],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Processed', 'Rejected'],
    default: 'Pending',
  },
  subtotal: {
    type: Number,
    default: 0,
    min: [0, 'Subtotal must be a positive number'],
  },
  totalTax: {
    type: Number,
    default: 0,
    min: [0, 'Total tax must be a positive number'],
  },
  transportCost: {
    type: Number,
    default: 0,
    min: [0, 'Transport cost must be a positive number'],
  },
  transportTax: {
    type: Number,
    default: 0,
    min: [0, 'Transport tax must be a positive number'],
  },
  grandTotal: {
    type: Number,
    default: 0,
    min: [0, 'Grand total must be a positive number'],
  },
}, {
  timestamps: true,
});

mrfSchema.pre('save', async function(next) {
  if (!this.mrfNumber) {
    const mrfDate = new Date(this.mrfDate);
    const currentYear = mrfDate.getFullYear();
    const nextYear = currentYear + 1;
    const financialYear = `${currentYear}-${nextYear.toString().slice(-2)}`;
    
    const startOfYear = new Date(currentYear, 3, 1);
    const endOfYear = new Date(nextYear, 2, 31);
    
    const count = await mongoose.model('MRF').countDocuments({
      mrfDate: {
        $gte: startOfYear,
        $lte: endOfYear
      }
    });
    
    const serialNumber = String(count + 1).padStart(3, '0');
    this.mrfNumber = `MRF/${financialYear}/${serialNumber}`;
  }
  next();
});

mrfSchema.pre('save', function(next) {
  this.subtotal = this.items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.rate;
    const discountedTotal = itemTotal - (itemTotal * item.discount / 100);
    return sum + discountedTotal;
  }, 0);
  
  this.totalTax = this.items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.rate;
    const discountedTotal = itemTotal - (itemTotal * item.discount / 100);
    return sum + (discountedTotal * item.tax / 100);
  }, 0);
  
  this.grandTotal = this.subtotal + this.totalTax + this.transportCost + this.transportTax;
  
  next();
});

const MRF = mongoose.model('MRF', mrfSchema);

module.exports = MRF;