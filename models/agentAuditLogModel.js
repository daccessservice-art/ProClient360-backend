const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Every write the Agent ever performs gets recorded here — this is the
// accountability layer for a 100+ user production system. If a manager
// ever asks "did the AI change this?", this collection has the answer,
// independent of anything the chat UI shows.
const agentAuditLogSchema = new Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  agentModule: {
    type: String,
    default: 'projectTaskAgent', // future modules (salesAgent, amcAgent...) use their own value
  },
  actionType: {
    type: String,
    enum: ['field_update', 'action_log'],
    required: true,
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskSheet',
    required: true,
  },
  // Free-form snapshot of exactly what changed — kept flexible since
  // field_update and action_log have different shapes.
  details: {
    type: Schema.Types.Mixed,
    required: true,
  },
}, {
  timestamps: true,
});

agentAuditLogSchema.index({ performedBy: 1, createdAt: -1 });
agentAuditLogSchema.index({ task: 1, createdAt: -1 });

module.exports = mongoose.model('AgentAuditLog', agentAuditLogSchema);