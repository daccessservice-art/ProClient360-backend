const mongoose = require('mongoose');

const vendorLinkSchema = new mongoose.Schema({
  linkId: {
    type: String,
    required: true,
    unique: true
  },
  linkUrl: {
    type: String,
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  usedAt: {
    type: Date
  }
}, {
  timestamps: true
});

const VendorLink = mongoose.model('VendorLink', vendorLinkSchema);

module.exports = VendorLink;