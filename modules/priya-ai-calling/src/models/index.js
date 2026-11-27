// MongoDB collections for AI calling (prefixed "ai_" so they never clash with your CRM's own collections).
// Each AI lead can point to your CRM's own lead/customer via crmLeadId.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const STAGES = ['new', 'contacted', 'interested', 'appointment', 'callback', 'not_interested', 'won', 'lost'];
const OUTCOMES = ['appointment_booked', 'interested', 'callback_requested', 'not_interested', 'wrong_number',
  'do_not_call', 'transferred', 'no_answer', 'busy', 'voicemail', 'failed', 'other'];

const ROLES = ['sales', 'marketing', 'service'];

const opts = { timestamps: true };
const model = (name, schema, collection) => mongoose.models[name] || mongoose.model(name, schema, collection);

// Your sales / marketing / service team. Tripti forwards live calls to the lead's assigned employee.
const EmployeeSchema = new Schema({
  crmUserId: { type: String, index: true }, // id of this person in your CRM's users collection
  name: { type: String, required: true },
  phone: { type: String, required: true }, // E.164 +919876543210 (calls are forwarded here)
  email: String,
  role: { type: String, enum: ROLES, default: 'sales', index: true },
  areas: [String], // optional: cities/areas this person covers, e.g. ["Baner", "Wakad"]
  active: { type: Boolean, default: true }, // inactive = no new leads, no forwarded calls
  lastAssignedAt: Date, // used for round-robin
}, opts);

const LeadSchema = new Schema({
  crmLeadId: { type: String, index: true }, // _id of the lead/customer in your existing CRM
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true }, // E.164 +919876543210
  email: String,
  company: String,
  placeType: String, // office / factory / society / school / shop ...
  city: String,
  productInterest: String, // CCTV, attendance, boom barrier ...
  source: String, // IndiaMART, website, JustDial ...
  stage: { type: String, enum: STAGES, default: 'new', index: true },
  notes: String,
  consent: { type: Boolean, default: false },
  dnd: { type: Boolean, default: false },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'AiEmployee', index: true }, // sales/marketing employee
}, opts);

const CallSchema = new Schema({
  providerCallId: { type: String, unique: true, sparse: true }, // Bolna execution_id
  lead: { type: Schema.Types.ObjectId, ref: 'AiLead', index: true },
  campaign: { type: Schema.Types.ObjectId, ref: 'AiCampaign' },
  campaignLead: { type: Schema.Types.ObjectId, ref: 'AiCampaignLead' },
  direction: { type: String, enum: ['inbound', 'outbound'] },
  phone: String,
  status: { type: String, default: 'queued', index: true },
  outcome: { type: String, enum: [...OUTCOMES, null] },
  summary: String,
  transcript: String,
  recordingUrl: String,
  endedReason: String,
  durationSec: Number,
  costUsd: Number,
  extracted: Schema.Types.Mixed, // raw data Tripti captured (requirement, quantity, timeline...)
  startedAt: Date,
  endedAt: Date,
}, opts);

const AppointmentSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'AiLead', index: true },
  call: { type: Schema.Types.ObjectId, ref: 'AiCall' },
  scheduledFor: String, // as confirmed on the call: "Saturday 29 Nov, 11 AM"
  address: String,
  purpose: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'AiEmployee', index: true },
  status: { type: String, default: 'scheduled' },
}, opts);

const FollowUpSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: 'AiLead', index: true },
  call: { type: Schema.Types.ObjectId, ref: 'AiCall' },
  kind: { type: String, enum: ['call', 'whatsapp', 'sms'], default: 'call' },
  dueAt: String,
  notes: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'AiEmployee', index: true },
  done: { type: Boolean, default: false },
}, opts);

const CampaignSchema = new Schema({
  name: { type: String, required: true },
  callType: { type: String, default: 'promotional' }, // promotional (140) / service (160)
  assignRole: { type: String, enum: ROLES, default: 'sales' }, // unassigned leads get an employee of this role
  status: { type: String, enum: ['draft', 'running', 'paused', 'completed'], default: 'draft' },
}, opts);

const CampaignLeadSchema = new Schema({
  campaign: { type: Schema.Types.ObjectId, ref: 'AiCampaign', index: true },
  lead: { type: Schema.Types.ObjectId, ref: 'AiLead' },
  status: { type: String, enum: ['pending', 'calling', 'done', 'failed', 'skipped'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: Date,
  lastOutcome: String,
  skipReason: String,
}, opts);
CampaignLeadSchema.index({ campaign: 1, lead: 1 }, { unique: true });

module.exports = {
  STAGES,
  ROLES,
  Employee: model('AiEmployee', EmployeeSchema, 'ai_employees'),
  OUTCOMES,
  Lead: model('AiLead', LeadSchema, 'ai_leads'),
  Call: model('AiCall', CallSchema, 'ai_calls'),
  Appointment: model('AiAppointment', AppointmentSchema, 'ai_appointments'),
  FollowUp: model('AiFollowUp', FollowUpSchema, 'ai_followups'),
  Campaign: model('AiCampaign', CampaignSchema, 'ai_campaigns'),
  CampaignLead: model('AiCampaignLead', CampaignLeadSchema, 'ai_campaign_leads'),
};
