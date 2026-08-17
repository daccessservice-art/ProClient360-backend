const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const buttonSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: 20 }, // Meta's hard limit on button label length
}, { _id: false });

// NEW — one tappable question. Sent as a WhatsApp List Message (real,
// genuinely clickable rows) once the customer engages — see
// campaignSessionModel.js for why this can't be sent in the initial blast.
const optionSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 24 }, // Meta's row title limit
  description: { type: String, trim: true, maxlength: 72, default: '' }, // Meta's row description limit
}, { _id: false });

const questionSchema = new Schema({
  questionText: { type: String, required: true, trim: true, maxlength: 1024 }, // shown as the list message body
  options: {
    type: [optionSchema],
    validate: {
      validator: (arr) => arr.length >= 1 && arr.length <= 10, // Meta's row-per-section limit
      message: 'Each question needs 1 to 10 tappable options.',
    },
  },
}, { _id: false });

const campaignTemplateSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },

  title: { type: String, required: true, trim: true }, // product name, e.g. "Boom Barrier"

  // Meta requires lowercase_snake_case names — auto-generated from title.
  metaTemplateName: { type: String, required: true, trim: true, lowercase: true },

  // NEW — Meta's own numeric template ID, returned only after the FIRST
  // successful submission. Required to ever edit this template later —
  // Pinnacle's "Edit Template" API is called by this ID, not by name,
  // and uses a completely different URL/format than creating a new one.
  metaTemplateId: { type: String, default: null },

  category: { type: String, enum: ['MARKETING', 'UTILITY'], default: 'MARKETING' },
  language: { type: String, default: 'en' },
  bodyText: { type: String, required: true }, // the initial outbound template text (static, not clickable)

  // Up to 3 quick-reply buttons on the template itself.
  buttons: {
    type: [buttonSchema],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 3,
      message: 'Meta allows a maximum of 3 quick-reply buttons per template.',
    },
  },

  // NEW — the real "clickable questionnaire". Sent as a sequence of List
  // Messages AFTER the customer's first reply opens a session (see
  // campaignSessionModel.js). Up to 10 questions, each with 1–10 tappable
  // options — this is what replaces your ☐ checkbox text with something
  // actually tappable.
  questions: {
    type: [questionSchema],
    default: [],
    validate: {
      validator: (arr) => arr.length <= 10,
      message: 'Maximum 10 questions per template.',
    },
  },

  status: {
    type: String,
    enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'DRAFT',
  },

  rejectionReason: { type: String, default: '' },
  createdBy: { type: Types.ObjectId, ref: 'Employee' },
}, { timestamps: true });

campaignTemplateSchema.index({ company: 1, metaTemplateName: 1 }, { unique: true });

module.exports = mongoose.model('CampaignTemplate', campaignTemplateSchema);