const mongoose = require('mongoose');


const customerHistorySchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
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
    default: 'Updated via customer edit'
  }
});

const CustomerHistory = mongoose.model('CustomerHistory', customerHistorySchema);

module.exports = CustomerHistory;
