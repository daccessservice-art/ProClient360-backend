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

  // System field (free text, max 500 chars)
  system: { type: String, trim: true, default: '', maxlength: 500 },

  // Remark field (max 2000 chars)
  remark: { type: String, trim: true, default: '', maxlength: 2000 },

  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },

  // In Process — when true, the red expiry blinker is replaced by a blue "In Process" blinker
  inProcess: { type: Boolean, default: false },

  // Next Follow-up Date — when this date arrives / passes, row blinks YELLOW
  nextFollowUpDate: { type: Date, default: null },

  // Lost — when true, record shows a grey "Lost" badge, no blinker. Remark is required.
  lost: { type: Boolean, default: false },
  lostAt: { type: Date, default: null },

  // Sales Lead — marks this AMC as assigned to the Sales team
  sentToSales: { type: Boolean, default: false },
  sentToSalesAt: { type: Date, default: null },
  sentToSalesByName: { type: String, default: '' },

  // ── NEW: Link to the Project (Project Master) this AMC record was created from.
  // Used so the "Project AMC Alerts" panel stops showing a project once its AMC is created. ──
  sourceProject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    default: null,
  },
  sourceProjectName: { type: String, default: '' },

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
oldAMCHistorySchema.index({ sourceProject: 1 }); // ── NEW ──

module.exports = mongoose.model('OldAMCHistory', oldAMCHistorySchema);