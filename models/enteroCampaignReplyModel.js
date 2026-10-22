// models/enteroCampaignReplyModel.js — ENTERO SYSTEMS (separate collection)
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const enteroCampaignReplySchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  customer: { type: Types.ObjectId, ref: 'Customer', index: true },
  phone: { type: String, default: '' },
  message: { type: String, default: '' },
  messageId: { type: String, default: '' },
  isButtonClick: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('EnteroCampaignReply', enteroCampaignReplySchema);