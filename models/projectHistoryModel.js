const mongoose = require('mongoose');


const projectHistorySchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
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
    default: 'Updated via project edit'
  }
});

const ProjectHistory = mongoose.model('ProjectHistory', projectHistorySchema);

module.exports = ProjectHistory;
