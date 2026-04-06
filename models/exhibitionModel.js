// models/exhibitionModel.js
const mongoose = require('mongoose');

const exhibitionSchema = new mongoose.Schema({
  exhibitionName: {
    type: String,
    required: [true, 'Exhibition name is required'],
    trim: true,
    maxlength: [200, 'Exhibition name cannot exceed 200 characters'],
  },
  targetAddress: {
    type: String,
    required: [true, 'Target address is required'],
    trim: true,
    maxlength: [500, 'Target address cannot exceed 500 characters'],
  },
  dateFrom: {
    type: Date,
    required: [true, 'Start date is required'],
  },
  dateTo: {
    type: Date,
    required: [true, 'End date is required'],
  },
  venue: {
    type: String,
    required: [true, 'Venue is required'],
    trim: true,
    maxlength: [300, 'Venue cannot exceed 300 characters'],
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters'],
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
    maxlength: [100, 'Country cannot exceed 100 characters'],
  },
  exhibitionFees: {
    type: Number,
    required: [true, 'Exhibition fees are required'],
    min: [0, 'Exhibition fees cannot be negative'],
  },
  stallDesignationFees: {
    type: Number,
    required: [true, 'Stall designation fees are required'],
    min: [0, 'Stall designation fees cannot be negative'],
  },

  // ✅ NEW: Exhibition Owner — selected employee responsible for this exhibition
  exhibitionOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null,
  },

  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Ongoing', 'Completed', 'Cancelled'],
    default: 'Upcoming',
  },
}, {
  timestamps: true,
});

const Exhibition = mongoose.model('Exhibition', exhibitionSchema);
module.exports = Exhibition;