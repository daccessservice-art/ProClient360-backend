// models/invitationResponseModel.js — every button tap on an invitation
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const invitationResponseSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  template: { type: Types.ObjectId, ref: 'InvitationTemplate', required: true, index: true },
  customer: { type: Types.ObjectId, ref: 'Customer', default: null },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  buttonText: { type: String, default: '' },
  replySent: { type: Boolean, default: false },
  replyError: { type: String, default: '' },
  messageId: { type: String, default: '' }, // inbound WhatsApp id — stops double replies if the webhook repeats
}, { timestamps: true });

invitationResponseSchema.index({ messageId: 1 });

module.exports = mongoose.model('InvitationResponse', invitationResponseSchema);