const mongoose = require('mongoose');

// One document = one phone call made to a customer regarding one Old AMC History record
const amcCallLogSchema = new mongoose.Schema({
  amc: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'AMC record is required'],
    index: true,
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  custName: { type: String, trim: true, default: '' },
  phoneNumber: { type: String, trim: true, default: '' },

  // Set automatically by server at the moment the call is saved
  calledAt: { type: Date, default: Date.now, index: true },

  outcome: {
    type: String,
    enum: [
      'Connected',
      'Interested',
      'Not Answered',
      'Busy',
      'Switched Off / Not Reachable',
      'Call Back Later',
      'Wrong Number',
      'Not Interested',
    ],
    default: 'Connected',
  },
  remark: {
    type: String,
    trim: true,
    required: [true, 'Remark is required for every call'],
    maxlength: [1000, 'Remark cannot exceed 1000 characters'],
  },
  nextFollowUpDate: { type: Date, default: null },

  calledBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  calledByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

amcCallLogSchema.index({ company: 1, amc: 1, calledAt: -1 });

module.exports = mongoose.model('AMCCallLog', amcCallLogSchema);