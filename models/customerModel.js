const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  ownedBy: {
    type: String,
    required: [true, 'Owner name is required'],
    trim: true,
    maxlength: [100, 'Owner name cannot exceed 100 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    unique: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please fill a valid email address'],
  },
  custName: {
    type: String,
    required: [true, 'Customer Name is required'],
    trim: true,
    minlength: [2, 'Customer name must be at least 2 characters long'],
    maxlength: [300, 'Customer name cannot exceed 300 characters'],
  },
  billingAddress: {
    add: {
      type: String,
      maxlength: [500, 'Address cannot exceed 500 characters'],
      required: [true, 'Address is required'],
    },
    city: {
      type: String,
      maxlength: [50, 'City cannot exceed 50 characters'],
      required: [true, 'City is required'],
    },
    state: {
      type: String,
      maxlength: [50, 'State cannot exceed 50 characters'],
      required: [true, 'State is required'],
    },
    country: {
      type: String,
      maxlength: [50, 'Country cannot exceed 50 characters'],
      required: [true, 'Country is required'],
    },
    pincode: {
      type: Number,
      required: [true, 'Pincode is required'],
    },
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  GSTNo: {
    type: String,
    required: [true, 'GST number is required'],
    maxlength: [15, 'GST number cannot exceed 15 characters'],
  },

  // ── Contact Person 1 ──
  customerContactPersonName1: {
    type: String,
    required: [true, 'Customer Contact Person Name is required'],
    minlength: [2, 'Customer Contact Person Name must be at least 2 characters long'],
    maxlength: [100, 'Customer Contact Person Name cannot exceed 100 characters'],
    trim: true,
  },
  phoneNumber1: {
    type: String,
    required: [true, 'Phone number is required'],
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d+$/, 'Invalid Phone number, It must contain only numbers'],
  },
  customerContactPersonEmail1: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    default: '',
  },
  customerContactPersonDesignation1: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters'],
    default: '',
  },

  // ── Contact Person 2 ──
  customerContactPersonName2: {
    type: String,
    maxlength: [100, 'Customer Contact Person Name cannot exceed 100 characters'],
    default: '',
  },
  phoneNumber2: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d*$/, 'Invalid Phone number, It must contain only numbers'],
    default: '',
  },
  customerContactPersonEmail2: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    default: '',
  },
  customerContactPersonDesignation2: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters'],
    default: '',
  },

  // ── Contact Person 3 ──
  customerContactPersonName3: {
    type: String,
    maxlength: [100, 'Customer Contact Person Name cannot exceed 100 characters'],
    default: '',
  },
  phoneNumber3: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d*$/, 'Invalid Phone number, It must contain only numbers'],
    default: '',
  },
  customerContactPersonEmail3: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    default: '',
  },
  customerContactPersonDesignation3: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters'],
    default: '',
  },

  // ── Contact Person 4 ──
  customerContactPersonName4: {
    type: String,
    maxlength: [100, 'Customer Contact Person Name cannot exceed 100 characters'],
    default: '',
  },
  phoneNumber4: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d*$/, 'Invalid Phone number, It must contain only numbers'],
    default: '',
  },
  customerContactPersonEmail4: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    default: '',
  },
  customerContactPersonDesignation4: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters'],
    default: '',
  },

  // ── Contact Person 5 ──
  customerContactPersonName5: {
    type: String,
    maxlength: [100, 'Customer Contact Person Name cannot exceed 100 characters'],
    default: '',
  },
  phoneNumber5: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d*$/, 'Invalid Phone number, It must contain only numbers'],
    default: '',
  },
  customerContactPersonEmail5: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    default: '',
  },
  customerContactPersonDesignation5: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters'],
    default: '',
  },

  zone: {
    type: String,
    required: [true, 'Zone is required'],
    enum: {
      values: ['North', 'South', 'East', 'West', 'Central'],
      message: 'Zone must be one of the following: North, South, East, West, Central',
    },
  },
  industryType: {
    type: String,
    required: [true, 'Industry type is required'],
    enum: {
      values: [
        'IT & Software',
        'Manufacturing',
        'Construction & Infrastructure',
        'Healthcare',
        'Education',
        'Retail',
        'Banking & Finance',
        'Logistics & Supply Chain',
        'Hospitality',
        'Real Estate',
        'Government & Public Sector',
        'Energy & Utilities',
        'Telecom',
        'Pharmaceuticals',
        'Automotive',
        'Dealer',
        'Other',
      ],
      message: 'Please select a valid industry type',
    },
  },
  industryTypeOther: {
    type: String,
    trim: true,
    maxlength: [100, 'Industry type description cannot exceed 100 characters'],
  },
  customerPriority: {
    type: String,
    required: [true, 'Customer priority is required'],
    enum: {
      values: ['P1', 'P2', 'P3'],
      message: 'Customer priority must be P1, P2, or P3',
    },
    default: 'P2',
  },
}, {
  timestamps: true,
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;