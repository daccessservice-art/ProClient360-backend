const mongoose = require('mongoose');
const EngineerLocation = require('../models/engineerLocationModel');
const EngineerDuty = require('../models/engineerDutyModel');
const Employee = require('../models/employeeModel');
const { checkPointAgainstOpenVisit } = require('./serviceVisitController'); // ✅ NEW — 100 m site check

// ---------- Helpers ----------

// Company id for both company login and employee login
const getCompanyId = (user) =>
    user.company ? (user.company._id || user.company) : user._id;

const isValidLatLng = (lat, lng) =>
    typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// Distance between 2 GPS points in metres
const distanceMeters = (a, b) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

// Company login has no "employee" to track — only employees can send location
const onlyEmployee = (req, res) => {
    if (!req.user.company) {
        res.status(403).json({ success: false, error: 'Only service engineers can use location tracking' });
        return false;
    }
    return true;
};

const MAX_POINTS_PER_REQUEST = 100;
const MAX_ACCURACY_FOR_DISTANCE = 100; // ignore bad GPS (> 100 m) when adding up distance

// ---------- Engineer (mobile app) ----------

// POST /api/location/duty/start   body: { lat, lng }
exports.startDuty = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const user = req.user;
        const company = getCompanyId(user);
        const { lat, lng } = req.body || {};

        const openDuty = await EngineerDuty.findOne({ employee: user._id, endAt: null });
        if (openDuty) {
            return res.status(200).json({ success: true, message: 'Already on duty', duty: openDuty });
        }

        const duty = await EngineerDuty.create({
            employee: user._id,
            company,
            startAt: new Date(),
            startLocation: isValidLatLng(lat, lng) ? { lat, lng } : undefined,
        });

        res.status(201).json({ success: true, message: 'Duty started', duty });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while starting duty: ' + error.message });
    }
};

// POST /api/location/duty/end   body: { lat, lng }
exports.endDuty = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const user = req.user;
        const { lat, lng } = req.body || {};

        const duty = await EngineerDuty.findOneAndUpdate(
            { employee: user._id, endAt: null },
            {
                endAt: new Date(),
                endLocation: isValidLatLng(lat, lng) ? { lat, lng } : undefined,
            },
            { new: true }
        );

        if (!duty) {
            return res.status(404).json({ success: false, error: 'You are not on duty' });
        }

        res.status(200).json({ success: true, message: 'Duty ended', duty });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while ending duty: ' + error.message });
    }
};

// GET /api/location/duty/status
exports.dutyStatus = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const duty = await EngineerDuty.findOne({ employee: req.user._id, endAt: null });
        res.status(200).json({ success: true, onDuty: !!duty, duty });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting duty status: ' + error.message });
    }
};

// POST /api/location
// body: { points: [ { lat, lng, accuracy, speed, battery, serviceId, recordedAt } ] }
// (single point also allowed: { lat, lng, ... })
exports.savePoints = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const user = req.user;
        const company = getCompanyId(user);

        const duty = await EngineerDuty.findOne({ employee: user._id, endAt: null });
        if (!duty) {
            return res.status(409).json({ success: false, error: 'Start duty before sending location' });
        }

        let points = Array.isArray(req.body?.points) ? req.body.points : [req.body];
        if (points.length === 0) {
            return res.status(400).json({ success: false, error: 'No location points sent' });
        }
        if (points.length > MAX_POINTS_PER_REQUEST) {
            return res.status(400).json({ success: false, error: `Max ${MAX_POINTS_PER_REQUEST} points per request` });
        }

        const now = Date.now();
        const docs = [];
        let skipped = 0;

        for (const p of points) {
            const lat = Number(p?.lat);
            const lng = Number(p?.lng);
            const recordedAt = p?.recordedAt ? new Date(p.recordedAt) : new Date();

            // skip invalid / future / older-than-duty points
            if (!isValidLatLng(lat, lng) || isNaN(recordedAt.getTime()) ||
                recordedAt.getTime() > now + 5 * 60 * 1000 ||
                recordedAt < duty.startAt) {
                skipped++;
                continue;
            }

            docs.push({
                employee: user._id,
                company,
                duty: duty._id,
                service: p.serviceId && mongoose.Types.ObjectId.isValid(p.serviceId) ? p.serviceId : undefined,
                lat,
                lng,
                accuracy: p.accuracy != null ? Number(p.accuracy) : undefined,
                speed: p.speed != null ? Number(p.speed) : undefined,
                battery: p.battery != null ? Math.min(100, Math.max(0, Number(p.battery))) : undefined,
                recordedAt,
            });
        }

        if (docs.length > 0) {
            await EngineerLocation.insertMany(docs, { ordered: false });
        }

        // ✅ NEW — if engineer has started work on an onsite service, check the newest point
        // against the 100 m site radius. App shows "geofence.warning" when outside.
        let geofence = null;
        if (docs.length > 0) {
            const newest = docs.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
            geofence = await checkPointAgainstOpenVisit(user._id, { lat: newest.lat, lng: newest.lng, accuracy: newest.accuracy });
        }

        res.status(201).json({ success: true, saved: docs.length, skipped, geofence });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while saving location: ' + error.message });
    }
};

// ---------- Manager (web) ----------

// GET /api/location/live
// Latest position of every engineer who is on duty now
exports.liveLocations = async (req, res) => {
    try {
        const company = getCompanyId(req.user);

        const openDuties = await EngineerDuty.find({ company, endAt: null })
            .populate('employee', 'name')
            .lean();

        if (openDuties.length === 0) {
            return res.status(200).json({ success: true, engineers: [] });
        }

        const employeeIds = openDuties.map((d) => d.employee?._id).filter(Boolean);

        const latest = await EngineerLocation.aggregate([
            { $match: { company: new mongoose.Types.ObjectId(String(company)), employee: { $in: employeeIds } } },
            { $sort: { recordedAt: -1 } },
            { $group: { _id: '$employee', point: { $first: '$$ROOT' } } },
        ]);
        const latestByEmployee = new Map(latest.map((l) => [String(l._id), l.point]));

        const engineers = openDuties
            .filter((d) => d.employee)
            .map((d) => {
                const p = latestByEmployee.get(String(d.employee._id));
                return {
                    employeeId: d.employee._id,
                    name: d.employee.name,
                    dutyStartAt: d.startAt,
                    lat: p ? p.lat : d.startLocation?.lat ?? null,
                    lng: p ? p.lng : d.startLocation?.lng ?? null,
                    accuracy: p?.accuracy ?? null,
                    battery: p?.battery ?? null,
                    serviceId: p?.service ?? null,
                    lastSeenAt: p ? p.recordedAt : d.startAt,
                };
            });

        res.status(200).json({ success: true, engineers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting live locations: ' + error.message });
    }
};

// GET /api/location/history/:employeeId?date=YYYY-MM-DD   (date in India time, default today)
exports.history = async (req, res) => {
    try {
        const company = getCompanyId(req.user);
        const { employeeId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ success: false, error: 'Invalid employee id' });
        }

        const employee = await Employee.findOne({ _id: employeeId, company }).select('name').lean();
        if (!employee) {
            return res.status(404).json({ success: false, error: 'Employee not found' });
        }

        const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const date = req.query.date || todayIST;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, error: 'Date must be YYYY-MM-DD' });
        }

        const from = new Date(`${date}T00:00:00+05:30`);
        const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

        const points = await EngineerLocation.find({
            company,
            employee: employeeId,
            recordedAt: { $gte: from, $lt: to },
        })
            .select('lat lng accuracy speed battery service recordedAt')
            .sort({ recordedAt: 1 })
            .lean();

        const duties = await EngineerDuty.find({
            company,
            employee: employeeId,
            startAt: { $lt: to },
            $or: [{ endAt: null }, { endAt: { $gte: from } }],
        })
            .select('startAt endAt startLocation endLocation')
            .sort({ startAt: 1 })
            .lean();

        // total distance, ignoring low-accuracy GPS points
        let distance = 0;
        let prev = null;
        for (const p of points) {
            if (p.accuracy != null && p.accuracy > MAX_ACCURACY_FOR_DISTANCE) continue;
            if (prev) distance += distanceMeters(prev, p);
            prev = p;
        }

        res.status(200).json({
            success: true,
            employee: { _id: employee._id, name: employee.name },
            date,
            totalDistanceKm: Math.round(distance / 10) / 100,
            duties,
            points,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting location history: ' + error.message });
    }
};

// GET /api/location/engineers
// Engineers who used tracking in the last 30 days (for the history dropdown)
exports.trackedEngineers = async (req, res) => {
    try {
        const company = getCompanyId(req.user);
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const employeeIds = await EngineerDuty.distinct('employee', {
            company,
            startAt: { $gte: since },
        });

        const engineers = await Employee.find({ _id: { $in: employeeIds }, company })
            .select('name')
            .sort({ name: 1 })
            .lean();

        res.status(200).json({ success: true, engineers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting engineers: ' + error.message });
    }
};