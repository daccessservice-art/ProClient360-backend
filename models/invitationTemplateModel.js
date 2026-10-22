// models/invitationTemplateModel.js
// INVITATION CAMPAIGN — separate collection (invitationtemplates).
// One invitation = heading + message + optional image + up to 3 buttons.
// Each button has its own auto-reply, sent when the customer taps it.
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const invitationButtonSchema = new Schema({
  text: { type: String, required: true, trim: true, maxlength: 25 },           // Meta quick-reply limit
  replyMessage: { type: String, required: true, trim: true, maxlength: 4096 }, // sent when tapped (links are clickable)
}, { _id: false });

const invitationTemplateSchema = new Schema({
  company: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true, trim: true },          // event name, e.g. "Tech Meet Pune"
  heading: { type: String, trim: true, maxlength: 60, default: '' }, // shown bold at the top of the message
  bodyText: { type: String, required: true },                   // Initial Message
  image: {
    mediaId: { type: String, default: null },       // used when sending
    headerHandle: { type: String, default: null },  // used for Meta approval
  },
  buttons: {
    type: [invitationButtonSchema],
    default: [],
    validate: { validator: (a) => a.length <= 3, message: 'Maximum 3 buttons per invitation.' },
  },
  metaTemplateName: { type: String, required: true, trim: true, lowercase: true },
  metaTemplateId: { type: String, default: null },
  category: { type: String, enum: ['MARKETING', 'UTILITY'], default: 'MARKETING' },
  language: { type: String, default: 'en' },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'], default: 'DRAFT' },
  rejectionReason: { type: String, default: '' },
  createdBy: { type: Types.ObjectId, ref: 'Employee' },
}, { timestamps: true });

invitationTemplateSchema.index({ company: 1, metaTemplateName: 1 }, { unique: true });

module.exports = mongoose.model('InvitationTemplate', invitationTemplateSchema);