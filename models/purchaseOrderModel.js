const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  brandName: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    maxlength: [200, 'Brand name cannot exceed 200 characters'],
  },
  modelNo: {
    type: String,
    required: [true, 'Model number is required'],
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
    required: [true, 'Unit is required'],
    trim: true,
    maxlength: [50, 'Unit cannot exceed 50 characters'],
    default: 'pcs'
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
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
    required: [true, 'Vendor is required'],
  },
  orderDate: {
    type: Date,
    required: [true, 'Order date is required'],
  },
  orderNumber: {
    type: String,
    unique: true,
    trim: true,
    maxlength: [100, 'Order number cannot exceed 100 characters'],
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
    required: true,
    min: [0, 'Total amount cannot be negative'],
  },
  totalTax: {
    type: Number,
    required: true,
    min: [0, 'Total tax cannot be negative'],
  },
  transportCharges: {
    type: Number,
    default: 0,
    min: [0, 'Transport charges cannot be negative'],
  },
  packagingCharges: {
    type: Number,
    default: 0,
    min: [0, 'Packaging charges cannot be negative'],
  },
  taxOnTransport: {
    type: Number,
    default: 18,
    min: [0, 'Tax on transport cannot be negative'],
    max: [100, 'Tax on transport cannot exceed 100%'],
  },
  grandTotal: {
    type: Number,
    required: true,
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
  delivery: {
    type: String,
    enum: ['Free', 'Chargable', 'At actual'],
    default: 'Free',
  },
  paymentTerms: {
    advance: {
      type: Number,
      min: [0, 'Advance percentage cannot be negative'],
      max: [100, 'Advance percentage cannot exceed 100%'],
      default: 0,
    },
    creditPeriod: {
      type: Number,
      min: [0, 'Credit period cannot be negative'],
      default: 0,
    },
  },
  packagingInstructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Packaging instructions cannot exceed 500 characters'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Partially Received', 'Received', 'Cancelled'],
    default: 'Pending',
  },
}, {
  timestamps: true,
});

purchaseOrderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const orderDate = new Date(this.orderDate);
    const currentYear = orderDate.getFullYear();
    const nextYear = currentYear + 1;
    const financialYear = `${currentYear}-${nextYear.toString().slice(-2)}`;
    
    const startOfYear = new Date(currentYear, 3, 1); 
    const endOfYear = new Date(nextYear, 2, 31); 
    
    const count = await mongoose.model('PurchaseOrder').countDocuments({
      orderDate: {
        $gte: startOfYear,
        $lte: endOfYear
      }
    });
    
    const serialNumber = String(count + 1).padStart(3, '0');
    this.orderNumber = `DA/${financialYear}/${serialNumber}`;
  }
  next();
});

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;