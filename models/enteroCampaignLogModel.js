// models/enteroCampaignLogModel.js — ENTERO SYSTEMS (separate collection)
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const recipientResultSchema = new Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer' },
  name: { type: String, default: '' },
  mobile: { type: String, default: '' },
  status: { type: String, enum: ['sent', 'skipped'], required: true },
  reason: { type: String, default: '' },
}, { _id: false });

const enteroCampaignLogSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  template: { type: Types.ObjectId, ref: 'EnteroCampaignTemplate', required: true },
  templateTitle: { type: String, default: '' },
  sentBy: { type: Types.ObjectId, ref: 'Employee' },
  recipients: { type: [recipientResultSchema], default: [] },
  sentCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('EnteroCampaignLog', enteroCampaignLogSchema);