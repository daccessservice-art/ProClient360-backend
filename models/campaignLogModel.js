const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const recipientResultSchema = new Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer' },
  name: { type: String, default: '' },
  mobile: { type: String, default: '' },
  status: { type: String, enum: ['sent', 'skipped'], required: true },
  reason: { type: String, default: '' }, // populated only when status = 'skipped'
}, { _id: false });

const campaignLogSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  template: { type: Types.ObjectId, ref: 'CampaignTemplate', required: true },
  templateTitle: { type: String, default: '' }, // snapshot in case template is edited/deleted later
  sentBy: { type: Types.ObjectId, ref: 'Employee' },
  recipients: { type: [recipientResultSchema], default: [] },
  sentCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CampaignLog', campaignLogSchema);