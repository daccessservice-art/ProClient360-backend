const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
}, { _id: false });

// One duty session: Start Duty -> End Duty. Location is tracked only inside a duty.
const engineerDutySchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null }, // null = still on duty
    startLocation: pointSchema,
    endLocation: pointSchema,
}, {
    timestamps: true,
});

engineerDutySchema.index({ employee: 1, endAt: 1 });
engineerDutySchema.index({ company: 1, endAt: 1 });

module.exports = mongoose.model('EngineerDuty', engineerDutySchema);