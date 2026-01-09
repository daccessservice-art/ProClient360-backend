const mongoose = require('mongoose');

const companyHistorySchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  fieldName: {
    type: String,
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  changeDate: {
    type: Date,
    default: Date.now
  },
  changeReason: {
    type: String,
    default: 'Updated via company edit'
  }
});

const CompanyHistory = mongoose.model('CompanyHistory', companyHistorySchema);

module.exports = CompanyHistory;
