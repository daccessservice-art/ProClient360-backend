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
  // Basic inventory fields
  materialCode: {
    type: String,
    required: [true, 'Material code is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Material code cannot exceed 50 characters'],
  },
  materialName: {
    type: String,
    trim: true,
    maxlength: [100, 'Material name cannot exceed 100 characters'],
  },
  category: {
    type: String,
    enum: {
      values: ['Raw Material', 'Finished Goods', 'Repairing Material', 'Scrap', 'Asset'], // Added 'Asset'
      message: 'Category must be one of: Raw Material, Finished Goods, Repairing Material, Scrap, Asset',
    },
    trim: true,
  },
  unitPrice: {
    type: Number,
    min: [0, 'Unit price cannot be negative'],
  },
  currentStock: {
    type: Number,
    min: [0, 'Current stock cannot be negative'],
    default: 0,
  },
  minStockLevel: {
    type: Number,
    min: [0, 'Minimum stock level cannot be negative'],
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
  openingDate: { // New field
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: '',
  },
  
  // Product fields
  productName: {
    type: String,
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters'],
  },
  brandName: {
    type: String,
    trim: true,
    maxlength: [100, 'Brand name cannot exceed 100 characters'],
  },
  model: {
    type: String,
    trim: true,
    maxlength: [100, 'Model cannot exceed 100 characters'],
  },
  hsnCode: {
    type: String,
    trim: true,
    maxlength: [8, 'HSN code cannot exceed 8 characters'],
  },
  productCategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Product category cannot exceed 100 characters'],
  },
  baseUOM: {
    type: String,
    trim: true,
    maxlength: [50, 'Base UOM cannot exceed 50 characters'],
  },
  uomConversion: {
    type: Number,
    default: 1,
    min: [0, 'UOM conversion cannot be negative'],
  },
  mrp: {
    type: Number,
    min: [0, 'MRP cannot be negative'],
  },
  salesPrice: {
    type: Number,
    min: [0, 'Sales price cannot be negative'],
  },
  purchasePrice: {
    type: Number,
    min: [0, 'Purchase price cannot be negative'],
  },
  minQtyLevel: {
    type: Number,
    min: [0, 'Min quantity level cannot be negative'],
  },
  discountType: {
    type: String,
    enum: ['Zero Discount', 'In percentage', 'In Value'],
    default: 'Zero Discount',
  },
  discountValue: {
    type: Number,
    min: [0, 'Discount value cannot be negative'],
    default: 0,
  },
  
  // Tax fields
  taxType: {
    type: String,
    enum: ['none', 'gst'],
    default: 'none',
  },
  gstRate: {
    type: Number,
    min: [0, 'GST rate cannot be negative'],
    default: 0,
  },
  gstEffectiveDate: {
    type: Date,
  },
  
  // Transaction history
  transactions: [transactionSchema],
  
  // Company and user references
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

// Indexes for faster searches
inventorySchema.index({ materialCode: 1 });
inventorySchema.index({ materialName: 1 });
inventorySchema.index({ productName: 1 });
inventorySchema.index({ category: 1 });
inventorySchema.index({ currentStock: 1 });
inventorySchema.index({ company: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

module.exports = Inventory;