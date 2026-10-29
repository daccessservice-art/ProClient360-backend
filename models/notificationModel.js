const mongoose = require('mongoose');

// ✅ Lead notification types (used by web + mobile app)
const NOTIFICATION_TYPES = [
    'general',            // old / task notifications (default)
    'lead_assigned',      // new lead assigned to a sales employee
    'lead_reassigned',    // existing lead reassigned to a sales employee
    'lead_transferred',   // bulk ownership transfer
    'survey_assigned',    // survey engineer assigned on a lead
    'survey_submitted',   // survey report submitted -> lead owner informed
    'service_assigned',   // ✅ NEW: ticket assigned to service engineer
    'service_reassigned', // ✅ NEW: service re-allotted to another engineer
];

const nofiticationSchema = new mongoose.Schema({
    userIds:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        index: true,
    },
    // ✅ NEW: short heading (used as push title in mobile app)
    title:{
        type:String,
        trim:true,
        default:'',
        maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    message:{
        type:String,
        maxlength: [500, 'Message cannot exceed 500 characters'],
        required:true,
        trim:true,
        // ❌ removed lowercase:true — company names / product names must keep their case
    },
    // ✅ NEW: notification type
    type:{
        type:String,
        enum: NOTIFICATION_TYPES,
        default:'general',
        index: true,
    },
    // ✅ NEW: related lead (for lead notifications)
    leadId:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'lead',
        default:null,
    },
    // ✅ NEW: related service + ticket (for service notifications)
    serviceId:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        default:null,
    },
    ticketId:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        default:null,
    },
    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    // ✅ NEW: sender name fallback (company/admin users are not in Employee collection)
    senderName:{
        type:String,
        trim:true,
        default:'',
    },
    isSeen:{
        type:Boolean,
        default:false
    },
},{timestamps: true});

nofiticationSchema.index({ userIds: 1, isSeen: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', nofiticationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;