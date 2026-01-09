const mongoose = require('mongoose');

const amcSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: {
      values: ['CMC', 'NCMC', 'One Time Charge'],
      message: 'Type must be one of the following: CMC, NCMC, One Time Charge',
    },
    trim: true,
  },
  invoiceNumber: {
    type: String,
    trim: true,
    maxlength: [50, 'Invoice number cannot exceed 50 characters'],
  },
  invoiceDate: {
    type: Date,
  },
  invoiceAmount: {
    type: Number,
    min: [0, 'Invoice amount cannot be negative'],
  },
  amcStartDate: {
    type: Date,
  },
  amcEndDate: {
    type: Date,
  },
  quotationAmount: {
    type: Number,
    min: [0, 'Quotation amount cannot be negative'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    default: '',
  },
  // Work Data fields
  status: {
    type: String,
    enum: ['Pending', 'Ongoing', 'Won', 'Lost'],
    default: 'Pending'
  },
  step: {
    type: String,
    default: ''
  },
  completion: {
    type: Number,
    min: [0, 'Completion cannot be negative'],
    max: [100, 'Completion cannot exceed 100%'],
    default: 0
  },
  nextFollowUpDate: {
    type: Date,
    default: null
  },
  rem: {
    type: String,
    trim: true,
    maxlength: [500, 'Remark cannot exceed 500 characters'],
    default: ''
  },
  // Customer information fields
  customerType: {
    type: String,
    enum: ['new', 'existing'],
    default: 'new'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  customerName: {
    type: String,
    trim: true,
    maxlength: [100, 'Customer name cannot exceed 100 characters'],
  },
  contactPerson: {
    type: String,
    trim: true,
    maxlength: [50, 'Contact person cannot exceed 50 characters'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  contact: {
    type: String,
    trim: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number'],
  },
  address: {
    add: {
      type: String,
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [50, 'City cannot exceed 50 characters'],
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State cannot exceed 50 characters'],
    },
    country: {
      type: String,
      trim: true,
      maxlength: [50, 'Country cannot exceed 50 characters'],
      default: 'India'
    },
    pincode: {
      type: String,
      trim: true,
      match: [/^\d{6}$/, 'Please enter a valid 6-digit pincode'],
    }
  },
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

// Virtual for duration in days
amcSchema.virtual('duration').get(function() {
  if (!this.amcStartDate || !this.amcEndDate) return 0;
  return Math.ceil((this.amcEndDate - this.amcStartDate) / (1000 * 60 * 60 * 24));
});

// Virtual for days remaining
amcSchema.virtual('daysRemaining').get(function() {
  if (!this.amcEndDate) return 0;
  const today = new Date();
  const remaining = Math.ceil((this.amcEndDate - today) / (1000 * 60 * 60 * 24));
  return remaining > 0 ? remaining : 0;
});

// Pre-save middleware to check date validity if dates are provided
amcSchema.pre('save', function(next) {
  if (this.amcStartDate && this.amcEndDate && this.amcStartDate >= this.amcEndDate) {
    return next(new Error('AMC End Date must be after Start Date'));
  }
  next();
});

// Index for faster searches
amcSchema.index({ type: 1 });
amcSchema.index({ invoiceNumber: 1 });
amcSchema.index({ amcStartDate: 1, amcEndDate: 1 });
amcSchema.index({ company: 1 });

const AMC = mongoose.model('AMC', amcSchema);

module.exports = AMC;