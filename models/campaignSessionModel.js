const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const answerSchema = new Schema({
  questionText: { type: String, default: '' },
  answerTitle: { type: String, default: '' },      // the row title the customer tapped
  answerDescription: { type: String, default: '' }, // optional row description, if any
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

// One document per (customer, template) attempt. WhatsApp only allows the
// app to send free-form interactive messages (List Messages) AFTER the
// customer has messaged first — a template send does NOT open that
// window. So the flow is: send template -> customer replies (anything) ->
// this session starts -> we push Question 1 as a List Message -> customer
// taps -> Question 2 -> ... -> completed.
const campaignSessionSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  customer: { type: Types.ObjectId, ref: 'Customer', index: true },
  template: { type: Types.ObjectId, ref: 'CampaignTemplate', required: true },
  phone: { type: String, required: true },

  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
    default: 'PENDING', // PENDING = template sent, waiting for customer's first reply to start the questions
  },

  currentQuestionIndex: { type: Number, default: -1 }, // -1 = no question sent yet
  answers: { type: [answerSchema], default: [] },

  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

campaignSessionSchema.index({ company: 1, phone: 1, template: 1 });

module.exports = mongoose.model('CampaignSession', campaignSessionSchema);