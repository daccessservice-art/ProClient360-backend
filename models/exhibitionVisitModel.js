const mongoose = require('mongoose');

const exhibitionVisitSchema = new mongoose.Schema({
  exhibition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exhibition',
    required: [true, 'Exhibition is required'],
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [200, 'Customer name cannot exceed 200 characters'],
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
    maxlength: [200, 'Company name cannot exceed 200 characters'],
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    maxlength: [15, 'Mobile number cannot exceed 15 digits'],
    match: [/^\d+$/, 'Mobile number must contain only numbers'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please fill a valid email address'],
  },
  location: {
    type: String,
    trim: true,
    maxlength: [300, 'Location cannot exceed 300 characters'],
  },
  followUpDate: {
    type: Date,
  },
  remark: {
    type: String,
    trim: true,
    maxlength: [1000, 'Remark cannot exceed 1000 characters'],
  },

  // ✅ NEW FIELDS
  visitorDesignation: {
    type: String,
    trim: true,
    maxlength: [150, 'Visitor designation cannot exceed 150 characters'],
  },
  leadsType: {
    type: String,
    enum: {
      values: ['Hot Leads', 'Warm Leads', 'Cold Leads', ''],
      message: 'Leads type must be Hot Leads, Warm Leads, or Cold Leads',
    },
    default: '',
  },
  product: {
    type: String,
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters'],
  },

  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
}, {
  timestamps: true,
});

const ExhibitionVisit = mongoose.model('ExhibitionVisit', exhibitionVisitSchema);
module.exports = ExhibitionVisit;