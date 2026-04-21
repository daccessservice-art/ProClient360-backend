// models/qualityInspectionModel.js
const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  assetId: {
    type: String,
    unique: true,
    required: true,
  },
  qrCodeData: {
    type: String,
    required: true,
  },
  brandName: {
    type: String,
    required: true,
    trim: true,
  },
  modelNo: {
    type: String,
    required: true,
    trim: true,
  },
  unit: {
    type: String,
    default: 'No.',
  },
  inDate: {
    type: Date,
    required: true,
  },
  outDate: {
    type: Date,
    default: null,
  },
  serviceWarrantyMonths: {
    type: Number,
    default: 0,
  },
  warrantyExpiryDate: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['In Warehouse', 'Dispatched', 'In Service', 'Warranty Expired', 'Damaged'],
    default: 'In Warehouse',
  },
  boxNumber: {
    type: String,
    default: null,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null,
  },
  serviceHistory: [{
    date: Date,
    description: String,
    servicedBy: String,
  }],
}, {
  timestamps: true,
});

const qcItemSchema = new mongoose.Schema({
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
  receivedQuantity: {
    type: Number,
    required: [true, 'Received quantity (GRN QTY) is required'],
    min: [0, 'Received quantity cannot be negative'],
  },
  unit: {
    type: String,
    required: [true, 'Unit is required'],
    trim: true,
    default: 'No.'
  },
  baseUOM: {
    type: String,
    trim: true,
    default: '',
  },
  qcOkQuantity: {
    type: Number,
    required: [true, 'QC OK quantity is required'],
    min: [0, 'QC OK quantity cannot be negative'],
    validate: {
      validator: function(value) {
        return value <= this.receivedQuantity;
      },
      message: 'QC OK quantity cannot exceed received quantity'
    }
  },
  faultyQuantity: {
    type: Number,
    required: [true, 'Faulty quantity is required'],
    min: [0, 'Faulty quantity cannot be negative'],
    validate: {
      validator: function(value) {
        return (this.qcOkQuantity + value) === this.receivedQuantity;
      },
      message: 'QC OK quantity + Faulty quantity must equal received quantity'
    }
  },
  remark: {
    type: String,
    trim: true,
    maxlength: [500, 'Remark cannot exceed 500 characters'],
  },
  itemsPerBox: {
    type: Number,
    default: 1,
    min: [1, 'Items per box must be at least 1'],
  },
  serviceWarrantyMonths: {
    type: Number,
    default: 0,
    min: [0, 'Service warranty months cannot be negative'],
  },
  assets: [assetSchema],
});

const qualityInspectionSchema = new mongoose.Schema({
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
  qcNumber: {
    type: String,
    unique: true,
    trim: true,
  },
  grnNumber: {
    type: String,
    required: [true, 'GRN Number is required'],
    trim: true,
  },
  qcDate: {
    type: Date,
    required: [true, 'QC date is required'],
  },
  items: {
    type: [qcItemSchema],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'At least one item is required',
    },
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  totalAssets: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Index for QR code lookup
qualityInspectionSchema.index({ 'items.assets.assetId': 1 });
qualityInspectionSchema.index({ 'items.assets.qrCodeData': 1 });

// ─── PRE-SAVE: Auto-generate QC Number ───────────────────────────────────────
// NOTE: The post-save hook that used to generate assets has been REMOVED.
// Asset generation is handled exclusively in the controller (qualityInspectionController.js)
// using URL-based QR codes so that mobile scanning opens the browser directly.
// Having both the hook and controller generate assets caused every item to get
// double the assets (2 QR codes per asset instead of 1).
qualityInspectionSchema.pre('save', async function(next) {
  if (!this.qcNumber) {
    const qcDate = new Date(this.qcDate);
    const currentYear = qcDate.getFullYear();
    const nextYear = currentYear + 1;
    const financialYear = `${currentYear}-${nextYear.toString().slice(-2)}`;

    const startOfYear = new Date(currentYear, 3, 1);
    const endOfYear = new Date(nextYear, 2, 31);

    try {
      const latestQC = await mongoose.model('QualityInspection').findOne({
        qcDate: {
          $gte: startOfYear,
          $lte: endOfYear
        }
      }).sort({ qcNumber: -1 });

      let serialNumber = 1;
      if (latestQC && latestQC.qcNumber) {
        const parts = latestQC.qcNumber.split('/');
        if (parts.length === 3) {
          const lastSerial = parseInt(parts[2], 10);
          if (!isNaN(lastSerial)) {
            serialNumber = lastSerial + 1;
          }
        }
      }

      const formattedSerial = String(serialNumber).padStart(3, '0');
      this.qcNumber = `QC/${financialYear}/${formattedSerial}`;

      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

const QualityInspection = mongoose.model('QualityInspection', qualityInspectionSchema);

module.exports = QualityInspection;