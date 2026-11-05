// models/campaignLeadModel.js
// ✅ NEW FILE
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

// One record per WhatsApp-campaign customer that was marked
// Feasible (sent to Marketing / Sales) or Not Feasible.
const campaignLeadSchema = new Schema({
  company:    { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  customer:   { type: Types.ObjectId, ref: 'Customer', default: null },
  phone:      { type: String, required: true },            // last 10 digits
  name:       { type: String, default: '' },
  decision:   { type: String, enum: ['feasible', 'not-feasible'], required: true },
  target:     { type: String, enum: ['marketing', 'sales'] }, // only when feasible
  remark:     { type: String, default: '' },
  lead:       { type: Types.ObjectId, ref: 'lead', default: null },
  assignedTo: { type: Types.ObjectId, ref: 'Employee', default: null },
  decidedBy:  { type: Types.ObjectId, ref: 'Employee' },
}, { timestamps: true });

campaignLeadSchema.index({ company: 1, phone: 1 });

module.exports = mongoose.model('CampaignLead', campaignLeadSchema);