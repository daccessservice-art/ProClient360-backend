// models/invitationLogModel.js — one document per "Send Invitation" click
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const invitationRecipientSchema = new Schema({
  customerId: { type: Types.ObjectId, ref: 'Customer', default: null },
  name: { type: String, default: '' },
  mobile: { type: String, default: '' },
  status: { type: String, enum: ['sent', 'skipped'], required: true },
  reason: { type: String, default: '' },
  messageId: { type: String, default: '' }, // WhatsApp message id — links a button tap back to this invitation
}, { _id: false });

const invitationLogSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  template: { type: Types.ObjectId, ref: 'InvitationTemplate', required: true },
  templateTitle: { type: String, default: '' },
  sentBy: { type: Types.ObjectId, ref: 'Employee' },
  recipients: { type: [invitationRecipientSchema], default: [] },
  sentCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
}, { timestamps: true });

invitationLogSchema.index({ 'recipients.messageId': 1 });

module.exports = mongoose.model('InvitationLog', invitationLogSchema);