const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters'],
  },
  brandName: {
    type: String,
    trim: true,
    maxlength: [100, 'Brand name cannot exceed 100 characters'],
  },
  printName: {
    type: String,
    trim: true,
    maxlength: [100, 'Print name cannot exceed 100 characters'],
  },
  aliasName: {
    type: String,
    trim: true,
    maxlength: [100, 'Alias name cannot exceed 100 characters'],
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
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  productCategory: {
    type: String,
    trim: true,
  },
  baseUOM: {
    type: String,
    required: [true, 'Base UOM is required'],
    trim: true,
  },
  alternateUOM: {
    type: String,
    trim: true,
  },
  uomConversion: {
    type: Number,
    default: 1,
    min: [0, 'UOM conversion must be a positive number'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: {
      values: ['raw material', 'finish material', 'scrap', 'repairing material', 'work in progress', 'finished goods'],
      message: 'Category must be one of: raw material, finish material, scrap, repairing material, work in progress, finished goods',
    },
  },
  mrp: {
    type: Number,
    min: [0, 'MRP must be a positive number'],
  },
  salesPrice: {
    type: Number,
    min: [0, 'Sales price must be a positive number'],
  },
  purchasePrice: {
    type: Number,
    min: [0, 'Purchase price must be a positive number'],
  },
  minSalesPrice: {
    type: Number,
    min: [0, 'Minimum sales price must be a positive number'],
  },
  minQtyLevel: {
    type: Number,
    min: [0, 'Minimum quantity level must be a positive number'],
  },
  discountType: {
    type: String,
    enum: {
      values: ['Zero Discount', 'In percentage', 'In Value'],
      message: 'Discount type must be one of: Zero Discount, In percentage, In Value',
    },
    default: 'Zero Discount',
  },
  discountValue: {
    type: Number,
    default: 0,
    min: [0, 'Discount value must be a positive number'],
  },
  // ✅ Current Stock Quantity
  currentStockQty: {
    type: Number,
    default: 0,
    min: [0, 'Current stock quantity must be a non-negative number'],
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  taxType: {
    type: String,
    enum: ['none', 'gst', 'cess'],
    default: 'none'
  },
  gstRate: {
    type: Number,
    min: [0, 'GST rate must be a positive number'],
    default: 0
  },
  gstEffectiveDate: {
    type: Date
  },
  cessPercentage: {
    type: Number,
    min: [0, 'CESS percentage must be a positive number'],
    default: 0
  },
  cessAmount: {
    type: Number,
    min: [0, 'CESS amount must be a positive number'],
    default: 0
  }
}, {
  timestamps: true,
});

// ── NEW: compound index to make the duplicate-check query in
// createProduct (and the /duplicates aggregation) fast even with
// thousands of products, instead of a full collection scan every time
// someone clicks "Add". This does NOT enforce uniqueness at the DB level
// (still allows intentional duplicates, e.g. restocking under a new lot) —
// it's a performance index, not a `unique: true` constraint. ──
productSchema.index({ company: 1, productName: 1, brandName: 1, model: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;