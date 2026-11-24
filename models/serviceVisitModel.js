const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
    accuracy: Number,
}, { _id: false });

const alertSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now },
    type: { type: String, enum: ['tracking', 'check', 'endAttempt'] },
    lat: Number,
    lng: Number,
    accuracy: Number,
    distanceMeters: Number,
}, { _id: false });

// One visit of a service engineer to a service site:
// Start Work (site location saved) -> End Work (must be within 100 m of the start location)
const serviceVisitSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    workMode: { type: String },                       // copied from Service: Onsite / Remote
    geofenceRequired: { type: Boolean, default: true }, // false for Remote services
    radiusMeters: { type: Number, default: 100 },
    status: { type: String, enum: ['Started', 'Ended'], default: 'Started' },
    startAt: { type: Date, required: true },
    startLocation: pointSchema,
    endAt: { type: Date, default: null },
    endLocation: pointSchema,
    endDistanceMeters: { type: Number, default: null },
    outsideAlerts: [alertSchema],                       // every time engineer was found outside the radius
}, {
    timestamps: true,
});

serviceVisitSchema.index({ employee: 1, status: 1 });
serviceVisitSchema.index({ service: 1, startAt: -1 });
serviceVisitSchema.index({ company: 1, startAt: -1 });

module.exports = mongoose.model('ServiceVisit', serviceVisitSchema);