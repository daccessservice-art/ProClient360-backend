const mongoose = require('mongoose');

const oldAMCHistorySchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  custName: { type: String, trim: true, default: '' },
  customerType: { type: String, trim: true, default: 'main' }, // 'main' | 'branch'
  email: { type: String, trim: true, lowercase: true, default: '' },
  ownedBy: { type: String, trim: true, default: '' },
  industryType: { type: String, trim: true, default: '' },
  customerPriority: { type: String, trim: true, default: '' }, // P1 | P2 | P3

  customerContactPersonName1: { type: String, trim: true, default: '' },
  phoneNumber1: { type: String, trim: true, default: '' },
  customerContactPersonEmail1: { type: String, trim: true, lowercase: true, default: '' },
  customerContactPersonDesignation1: { type: String, trim: true, default: '' },

  billingAddress: {
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
  },

  GSTNo: { type: String, trim: true, default: '' },
  zone: { type: String, trim: true, default: '' },

  importBatch: { type: String, default: '' },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  importedByName: { type: String, default: '' },
  sourceFileName: { type: String, default: '' },
}, {
  timestamps: true,
});

oldAMCHistorySchema.index({ company: 1 });
oldAMCHistorySchema.index({ custName: 1 });
oldAMCHistorySchema.index({ importBatch: 1 });

module.exports = mongoose.model('OldAMCHistory', oldAMCHistorySchema);