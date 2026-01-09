const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['incoming', 'outgoing']
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: [200, 'Reason cannot exceed 200 characters']
  },
  date: {
    type: Date,
    default: Date.now
  },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }
}, { _id: true });

const inventorySchema = new mongoose.Schema({
  materialCode: {
    type: String,
    required: [true, 'Material code is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Material code cannot exceed 50 characters'],
  },
  hsmCode: {
    type: String,
    required: [true, 'HSM code is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'HSM code cannot exceed 50 characters'],
  },
  materialName: {
    type: String,
    required: [true, 'Material name is required'],
    trim: true,
    maxlength: [100, 'Material name cannot exceed 100 characters'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['Raw Material', 'Finished Goods', 'Repairing Material', 'Scrap'],
      message: 'Category must be one of: Raw Material, Finished Goods, Repairing Material, Scrap',
    },
    trim: true,
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    enum: {
      values: ['Pcs', 'Kg', 'Ltr', 'Mtr', 'Box', 'Set', 'Pair', 'Roll', 'Sheet', 'Bag'],
      message: 'Unit must be one of: Pcs, Kg, Ltr, Mtr, Box, Set, Pair, Roll, Sheet, Bag',
    },
    default: 'Pcs',
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price cannot be negative'],
  },
  gstPercentage: {
    type: Number,
    required: [true, 'GST Percentage is required'],
    min: [0, 'GST Percentage cannot be negative'],
  },
  currentStock: {
    type: Number,
    required: [true, 'Current stock is required'],
    min: [0, 'Current stock cannot be negative'],
    default: 0,
  },
  minStockLevel: {
    type: Number,
    required: [true, 'Minimum stock level is required'],
    min: [0, 'Minimum stock level cannot be negative'],
  },
  maxStockLevel: {
    type: Number,
    min: [0, 'Maximum stock level cannot be negative'],
  },
  warehouseLocation: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters'],
    default: '',
  },
  stockLocation: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters'],
    default: '',
  },

  transactions: [transactionSchema],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for stock status
inventorySchema.virtual('stockStatus').get(function() {
  if (this.currentStock === 0) return 'Out of Stock';
  if (this.currentStock <= this.minStockLevel) return 'Low Stock';
  return 'In Stock';
});

// Virtual for total value
inventorySchema.virtual('totalValue').get(function() {
  return this.currentStock * this.unitPrice;
});

// Pre-save middleware to validate max stock level
inventorySchema.pre('save', function(next) {
  if (this.maxStockLevel && this.maxStockLevel <= this.minStockLevel) {
    return next(new Error('Maximum stock level must be greater than minimum stock level'));
  }
  next();
});

// Indexes for faster searches
inventorySchema.index({ materialCode: 1 });
inventorySchema.index({ materialName: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ currentStock: 1 });
inventorySchema.index({ company: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;