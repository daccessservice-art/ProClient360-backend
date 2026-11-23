const mongoose = require('mongoose');

// One GPS point sent by a service engineer's mobile app
const engineerLocationSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    duty: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineerDuty' },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, // optional: service engineer is working on
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    accuracy: { type: Number },   // metres
    speed: { type: Number },      // m/s
    battery: { type: Number, min: 0, max: 100 },
    recordedAt: { type: Date, required: true }, // time on the phone when GPS was read
}, {
    timestamps: true,
});

engineerLocationSchema.index({ employee: 1, recordedAt: -1 });
engineerLocationSchema.index({ company: 1, recordedAt: -1 });
// Auto delete points older than 90 days
engineerLocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('EngineerLocation', engineerLocationSchema);