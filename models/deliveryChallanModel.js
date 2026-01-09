const mongoose = require('mongoose');

const dcItemSchema = new mongoose.Schema({
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
  }
});

const deliveryChallanSchema = new mongoose.Schema({
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
  dcNumber: {
    type: String,
    unique: true,
    trim: true,
  },
  choice: {
    type: String,
    required: [true, 'Choice is required'],
    enum: {
      values: ['DC Delivery chalan', 'returnable chalan', 'Rejected returnable chalan', 'scrap chalan'],
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
  dcDate: {
    type: Date,
    required: [true, 'DC date is required'],
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
    type: [dcItemSchema],
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
    enum: ['Pending', 'Delivered', 'Returned', 'Cancelled'],
    default: 'Pending',
  },
}, {
  timestamps: true,
});

deliveryChallanSchema.pre('save', async function(next) {
  if (!this.dcNumber) {
    const dcDate = new Date(this.dcDate);
    const currentYear = dcDate.getFullYear();
    const nextYear = currentYear + 1;
    const financialYear = `${currentYear}-${nextYear.toString().slice(-2)}`;
    
    const startOfYear = new Date(currentYear, 3, 1);
    const endOfYear = new Date(nextYear, 2, 31);
    
    const count = await mongoose.model('DeliveryChallan').countDocuments({
      dcDate: {
        $gte: startOfYear,
        $lte: endOfYear
      }
    });
    
    const serialNumber = String(count + 1).padStart(3, '0');
    this.dcNumber = `DC/${financialYear}/${serialNumber}`;
  }
  next();
});

const DeliveryChallan = mongoose.model('DeliveryChallan', deliveryChallanSchema);

module.exports = DeliveryChallan;