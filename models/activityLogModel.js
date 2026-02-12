const mongoose = require('mongoose');
const { Schema } = mongoose;

const activityLogSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  entityType: {
    type: String,
    required: true,
    enum: [
      'Lead', 'Customer', 'Employee', 'Project', 'Task', 'Department', 
      'Designation', 'Service', 'Product', 'Vendor', 'PurchaseOrder', 
      'GRN', 'QualityInspection', 'DeliveryChallan', 'MRF', 'AMC', 
      'Inventory', 'Ticket'
    ],
    index: true
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // For backward compatibility
  leadId: {
    type: Schema.Types.ObjectId,
    ref: 'lead'
  },
  actionType: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'REASSIGN', 'STATUS_CHANGE', 'CALL_ATTEMPT'],
    required: true,
    index: true
  },
  actionBy: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
    index: true
  },
  actionByName: {
    type: String,
    required: true
  },
  changes: [{
    field: String,
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed
  }],
  metadata: {
    ipAddress: String,
    userAgent: String,
    location: String
  },
  description: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { 
  timestamps: true,
  // Add compound indexes for better query performance
  index: [
    { company: 1, entityType: 1, entityId: 1, timestamp: -1 },
    { company: 1, actionType: 1, timestamp: -1 },
    { company: 1, actionBy: 1, timestamp: -1 }
  ]
});

// Pre-save middleware to populate leadId if entityType is 'Lead'
activityLogSchema.pre('save', function(next) {
  if (this.entityType === 'Lead' && !this.leadId) {
    this.leadId = this.entityId;
  }
  next();
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;