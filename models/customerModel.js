const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  ownedBy: {
    type: String, // Changed from ObjectId to String to allow manual input
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
      maxLength: [50, 'City cannot exceed 50 characters'],
      required: [true, 'City is required'],
    },
    state: {
      type: String,
      maxLength: [50, 'State cannot exceed 50 characters'],
      required: [true, 'State is required'],
    },
    country: {
      type: String,
      maxLength: [50, 'Country cannot exceed 50 characters'],
      required: [true, 'Country is required'],
    },
    pincode: {
      type: Number,
      maxLength: [6, 'Pincode cannot exceed 6 digits'],
      required: [true, 'Pincode is required'],
    },
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  GSTNo: {
    type: String,
    required: [true, 'GST number is required'],
    maxLength: [15, 'GST number cannot exceed 15 characters'],
  },
  customerContactPersonName1: {
    type: String,
    required: [true, 'Customer Contact Person Name is required'],
    minlength: [2, 'Customer Contact Person Name must be at least 3 characters long'],
    maxlength: [50, 'Customer Contact Person Name cannot exceed 50 characters'],
    trim: true,
  },
  phoneNumber1: {
    type: String,
    required: [true, 'Phone number is required'],
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d+$/, 'Invalid Phone number, It must contain only numbers'],
  },
  customerContactPersonName2: {
    type: String,
    maxlength: [50, 'Customer Contact Person Name cannot exceed 50 characters'],
  },
  phoneNumber2: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d+$/, 'Invalid Phone number, It must contain only numbers'],
  },
  zone: {
    type: String,
    required: [true, 'Zone is required'],
    enum: {
      values: ['North', 'South', 'East', 'West', 'Central'],
      message: 'Zone must be one of the following: North, South, East, West, Central',
    },
  }
}, {
  timestamps: true,
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;