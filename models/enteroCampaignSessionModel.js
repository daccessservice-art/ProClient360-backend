// models/enteroCampaignSessionModel.js — ENTERO SYSTEMS (separate collection)
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const answerSchema = new Schema({
  questionText: { type: String, default: '' },
  answerTitle: { type: String, default: '' },
  answerDescription: { type: String, default: '' },
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const enteroCampaignSessionSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  customer: { type: Types.ObjectId, ref: 'Customer', index: true },
  template: { type: Types.ObjectId, ref: 'EnteroCampaignTemplate', required: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'], default: 'PENDING' },
  currentQuestionIndex: { type: Number, default: -1 },
  answers: { type: [answerSchema], default: [] },
  firstImageAlreadySent: { type: Boolean, default: false },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

enteroCampaignSessionSchema.index({ company: 1, phone: 1, template: 1 });

module.exports = mongoose.model('EnteroCampaignSession', enteroCampaignSessionSchema);