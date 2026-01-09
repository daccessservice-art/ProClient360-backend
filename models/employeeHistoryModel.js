const mongoose = require('mongoose');


const employeeHistorySchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
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
    default: 'Updated via employee edit'
  }
});

const EmployeeHistory = mongoose.model('EmployeeHistory', employeeHistorySchema);

module.exports = EmployeeHistory;
