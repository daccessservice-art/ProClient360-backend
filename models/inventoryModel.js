const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Manual stock transaction (Incoming / Outgoing done from Inventory Master)
// ─────────────────────────────────────────────────────────────────────────────
const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['incoming', 'outgoing'],
  },
  quantity: {
    type: Number,
    required: true,
    min: [0.01, 'Quantity must be greater than 0'],
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: [200, 'Reason cannot exceed 200 characters'],
  },
  date: {
    type: Date,
    default: Date.now,
  },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  // 'inventory' = done in Inventory Master, 'product-master' = stock edited in Product Master
  source: {
    type: String,
    enum: ['inventory', 'product-master'],
    default: 'inventory',
  },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Activity log: who created / edited the item and what changed
// ─────────────────────────────────────────────────────────────────────────────
const activitySchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true },       // Created | Updated | Stock In | Stock Out
  details: { type: String, trim: true, default: '' },
  changes: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ field, label, from, to }]
  by: { type: mongoose.Schema.Types.ObjectId },                  // employee OR company login id
  byName: { type: String, trim: true, default: '' },             // name saved at that moment
  at: { type: Date, default: Date.now },
}, { _id: true });

const CATEGORY_VALUES =['Raw Material', 'Finished Goods', 'Repairing Material', 'Scrap', 'Asset'];

const inventorySchema = new mongoose.Schema({
  // ── Basic inventory fields ──
  // NOTE: materialCode is now unique PER COMPANY (see compound index below),
  // not globally unique. Two companies can use the same code.
  materialCode: {
    type: String,
    required: [true, 'Material code is required'],
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
      values: CATEGORY_VALUES,
      message: 'Category must be one of: Raw Material, Finished Goods, Repairing Material, Scrap, Asset',
    },
    trim: true,
    default: 'Raw Material',
  },
  unitPrice: {
    type: Number,
    min: [0, 'Unit price cannot be negative'],
    default: 0,
  },

  // ── Stock ──
  // openingStock  = stock entered when the item was created (or edited later)
  // currentStock  = stored mirror; the LIVE value is calculated by the controller:
  //                 linked item   -> Product Master currentStockQty (updated by GRN / DC)
  //                 unlinked item -> opening + manual in - manual out + GRN in - DC out
  openingStock: {
    type: Number,
    min: [0, 'Opening stock cannot be negative'],
  },
  currentStock: {
    type: Number,
    min: [0, 'Current stock cannot be negative'],
    default: 0,
  },
  minStockLevel: {
    type: Number,
    min: [0, 'Minimum stock level cannot be negative'],
    default: 0,
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
  openingDate: {
    type: Date,
    default: Date.now,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: '',
  },

  // ── Link to Product Master (source of live stock) ──
  linkedProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  },
  // true = row was created automatically because a product was added in Product Master
  autoCreated: {
    type: Boolean,
    default: false,
  },

  // ── Product fields ──
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

  // ── Tax fields ──
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

  // ── Manual transaction history ──
  transactions: [transactionSchema],

  // ── Who did what, and when ──
  activityLog: [activitySchema],

  // ── Company and user references ──
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
  },
}, {
  timestamps: true,
});

// ── Indexes ──
inventorySchema.index({ company: 1, materialCode: 1 }, { unique: true });
inventorySchema.index({ company: 1, linkedProduct: 1 });
inventorySchema.index({ company: 1, createdAt: -1 });
inventorySchema.index({ productName: 1 });
inventorySchema.index({ category: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);
Inventory.CATEGORY_VALUES = CATEGORY_VALUES;

// ── One-time cleanup: the old schema had a GLOBAL unique index on materialCode
// (materialCode_1). Drop it so the per-company unique index above is used. ──
const dropLegacyMaterialCodeIndex = async () => {
  try {
    const indexes = await Inventory.collection.indexes();
    const legacy = indexes.find((i) => i.name === 'materialCode_1' && i.unique);
    if (legacy) {
      await Inventory.collection.dropIndex('materialCode_1');
      console.log('✅ [Inventory] Dropped old global unique index materialCode_1');
    }
  } catch (e) {
    if (e?.codeName !== 'NamespaceNotFound') {
      console.warn('ℹ️ [Inventory] Legacy index check skipped:', e.message);
    }
  }
};

if (mongoose.connection.readyState === 1) {
  dropLegacyMaterialCodeIndex();
} else {
  mongoose.connection.once('open', dropLegacyMaterialCodeIndex);
}

module.exports = Inventory;