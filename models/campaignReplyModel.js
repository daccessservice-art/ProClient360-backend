const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

// Stores replies customers send back on WhatsApp. Kept as its own
// collection rather than modifying customerModel.js — no changes to
// your existing Customer schema required.
const campaignReplySchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  customer: { type: Types.ObjectId, ref: 'Customer', index: true },
  phone: { type: String, default: '' },
  message: { type: String, default: '' },
  messageId: { type: String, default: '' },

  // NEW — true when this reply came from tapping a quick-reply button
  // (a genuine click) rather than typing free text. Lets the UI show a
  // clear "tapped a button" badge instead of treating it as a typed answer.
  isButtonClick: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('CampaignReply', campaignReplySchema);