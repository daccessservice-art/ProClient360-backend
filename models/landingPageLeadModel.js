const mongoose = require('mongoose');
const { Schema } = mongoose;

const landingPageLeadSchema = new Schema({
  company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  landingPage: { type: String, required: true, trim: true, index: true },

  name:   { type: String, required: true, trim: true, maxlength: 100 },
  email:  { type: String, trim: true, lowercase: true, default: '', maxlength: 150 },
  phone:  { type: String, required: true, trim: true, maxlength: 20 },
  remark: { type: String, trim: true, default: '', maxlength: 1000 },

  // new = only in Landing Page Leads, moved = also in Marketing Master
  status:      { type: String, enum: ['new', 'moved'], default: 'new', index: true },
  movedToLead: { type: Schema.Types.ObjectId, ref: 'lead', default: null },
  movedBy:     { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  movedAt:     { type: Date, default: null },
  autoMoved:   { type: Boolean, default: false },

  pageUrl:   { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
}, { timestamps: true });

landingPageLeadSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('LandingPageLead', landingPageLeadSchema);