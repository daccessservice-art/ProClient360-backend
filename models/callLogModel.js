const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
    },
    service: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: [true, 'Service is required'],
    },
    calledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: [true, 'Called by is required'],
    },
    callDateTime: {
        type: Date,
        required: [true, 'Call date and time is required'],
    },
    callStatus: {
        type: String,
        enum: ["Answered", "Not Answered", "Busy", "Wrong Number", "Switched Off", "No Network", "Callback Requested"],
        required: [true, 'Call status is required'],
    },
    callDuration: {
        type: Number,
        default: 0,
        min: [0, 'Duration cannot be negative'],
    },
    notes: {
        type: String,
        maxlength: [300, 'Notes cannot exceed 300 characters'],
        trim: true,
        default: '',
    },
    customerResponse: {
        type: String,
        enum: ["Positive", "Neutral", "Negative", ""],
        default: "",
    },
}, {
    timestamps: true
});

callLogSchema.index({ service: 1, callDateTime: -1 });
callLogSchema.index({ company: 1 });

const CallLog = mongoose.model('CallLog', callLogSchema);
module.exports = CallLog;