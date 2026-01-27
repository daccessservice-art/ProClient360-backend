const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
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
  vendorName: {
    type: String,
    required: [true, 'Vendor Name is required'],
    trim: true,
    minlength: [2, 'Vendor name must be at least 2 characters long'],
    maxlength: [300, 'Vendor name cannot exceed 300 characters'],
  },
  materialCategory: {
    type: String,
    required: [true, 'Material category is required'],
    enum: {
      values: ['Raw Material', 'Finished Goods', 'Scrap Material'],
      message: 'Material category must be one of: Raw Material, Finished Goods, Scrap Material',
    },
  },
  typeOfVendor: {
    type: String,
    required: [true, 'Type of vendor is required'],
    enum: {
      values: ['Import', 'B2B Material', 'Labour Contractor', 'Turnkey Contractor', 'Logistics', 'Service', 'Freelancer', 'Other'],
      message: 'Type of vendor must be one of: Import, B2B Material, Labour Contractor, Turnkey Contractor, Logistics, Service, Freelancer, Other',
    },
  },
  vendorRating: {
    type: Number,
    required: [true, 'Vendor rating is required'],
    min: [1, 'Rating must be at least 1'],
    max: [5, 'Rating cannot exceed 5'],
  },
  brandsWorkWith: {
    type: String,
    trim: true,
    maxlength: [200, 'Brands work with cannot exceed 200 characters'],
    required: function() {
      return this.typeOfVendor === 'B2B Material';
    },
  },
  billingAddress: {
    add: {
      type: String,
      maxlength: [500, 'Address cannot exceed 500 characters'],
      required: function() {
        return this.typeOfVendor !== 'Import' && this.typeOfVendor !== 'Other';
      },
    },
    city: {
      type: String,
      maxLength: [50, 'City cannot exceed 50 characters'],
      required: function() {
        return this.typeOfVendor !== 'Import' && this.typeOfVendor !== 'Other';
      },
    },
    state: {
      type: String,
      maxLength: [50, 'State cannot exceed 50 characters'],
      required: function() {
        return this.typeOfVendor !== 'Import' && this.typeOfVendor !== 'Other';
      },
    },
    country: {
      type: String,
      maxLength: [50, 'Country cannot exceed 50 characters'],
      required: function() {
        return this.typeOfVendor !== 'Import' && this.typeOfVendor !== 'Other';
      },
    },
    pincode: {
      type: Number,
      maxLength: [6, 'Pincode cannot exceed 6 digits'],
      required: function() {
        return this.typeOfVendor !== 'Import' && this.typeOfVendor !== 'Other';
      },
    },
  },
  manualAddress: {
    type: String,
    trim: true,
    maxlength: [500, 'Manual address cannot exceed 500 characters'],
    required: function() {
      return this.typeOfVendor === 'Import';
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
  vendorContactPersonName1: {
    type: String,
    required: [true, 'Vendor Contact Person Name is required'],
    minlength: [2, 'Vendor Contact Person Name must be at least 3 characters long'],
    maxlength: [50, 'Vendor Contact Person Name cannot exceed 50 characters'],
    trim: true,
  },
  phoneNumber1: {
    type: String,
    required: [true, 'Phone number is required'],
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d+$/, 'Invalid Phone number, It must contain only numbers'],
  },
  vendorContactPersonName2: {
    type: String,
    maxlength: [50, 'Vendor Contact Person Name cannot exceed 50 characters'],
  },
  phoneNumber2: {
    type: String,
    maxlength: [11, 'Phone number cannot exceed 11 digits'],
    match: [/^\d+$/, 'Invalid Phone number, It must contain only numbers'],
  },
  customVendorType: {
    type: String,
    trim: true,
    maxlength: [100, 'Custom vendor type cannot exceed 100 characters'],
    required: function() {
      return this.typeOfVendor === 'Other';
    },
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [500, 'Remarks cannot exceed 500 characters'],
  },
  // New fields for tracking vendors registered from links
  registeredFromLink: {
    type: Boolean,
    default: false
  },
  linkId: {
    type: String
  }
}, {
  timestamps: true,
});

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;