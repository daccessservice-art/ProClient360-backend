const mongoose = require('mongoose');

const vendorHistorySchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  fieldName: {
    type: String,
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  changeReason: {
    type: String
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee'
  }
}, {
  timestamps: true
});

const VendorHistory = mongoose.model('VendorHistory', vendorHistorySchema);

module.exports = VendorHistory;