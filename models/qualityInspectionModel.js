const mongoose = require('mongoose');

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
  }
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
}, {
  timestamps: true,
});

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