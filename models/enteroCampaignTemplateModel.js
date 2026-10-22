// models/enteroCampaignTemplateModel.js
// ENTERO SYSTEMS — separate collection (enterocampaigntemplates).
// Same structure as campaignTemplateModel.js — DAccess data is never touched.
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const buttonSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: 20 },
}, { _id: false });

const optionSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 24 },
  description: { type: String, trim: true, maxlength: 72, default: '' },
}, { _id: false });

const questionSchema = new Schema({
  questionText: { type: String, required: true, trim: true, maxlength: 1024 },
  options: {
    type: [optionSchema],
    validate: {
      validator: (arr) => arr.length >= 1 && arr.length <= 10,
      message: 'Each question needs 1 to 10 tappable options.',
    },
  },
}, { _id: false });

const imageSchema = new Schema({
  mediaId: { type: String, required: true },
  headerHandle: { type: String, default: null },
  caption: { type: String, trim: true, maxlength: 1024, default: '' },
}, { _id: false });

const enteroCampaignTemplateSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true, trim: true },
  metaTemplateName: { type: String, required: true, trim: true, lowercase: true },
  metaTemplateId: { type: String, default: null },
  category: { type: String, enum: ['MARKETING', 'UTILITY'], default: 'MARKETING' },
  language: { type: String, default: 'en' },
  bodyText: { type: String, required: true },
  buttons: {
    type: [buttonSchema],
    default: [],
    validate: { validator: (arr) => arr.length <= 3, message: 'Meta allows a maximum of 3 quick-reply buttons per template.' },
  },
  questions: {
    type: [questionSchema],
    default: [],
    validate: { validator: (arr) => arr.length <= 10, message: 'Maximum 10 questions per template.' },
  },
  images: {
    type: [imageSchema],
    default: [],
    validate: { validator: (arr) => arr.length <= 5, message: 'Maximum 5 images per template.' },
  },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], default: 'DRAFT' },
  rejectionReason: { type: String, default: '' },
  createdBy: { type: Types.ObjectId, ref: 'Employee' },
}, { timestamps: true });

enteroCampaignTemplateSchema.index({ company: 1, metaTemplateName: 1 }, { unique: true });

module.exports = mongoose.model('EnteroCampaignTemplate', enteroCampaignTemplateSchema);