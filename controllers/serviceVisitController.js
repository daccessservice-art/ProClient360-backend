const mongoose = require('mongoose');
const ServiceVisit = require('../models/serviceVisitModel');
const Service = require('../models/serviceModel');

// ---------- Settings ----------
const RADIUS_METERS = 100;          // engineer must stay / end work within 100 m of the start location
const MAX_GPS_ACCURACY_METERS = 100; // weaker GPS than this is not accepted for start / end
const ALERT_EVERY_MINUTES = 5;      // save an "outside" alert at most once every 5 minutes

// ---------- Helpers ----------

const getCompanyId = (user) =>
    user.company ? (user.company._id || user.company) : user._id;

const distanceMeters = (a, b) => {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

// Reads { lat, lng, accuracy } from the body; returns null if invalid
const readPoint = (body = {}) => {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }
    const accuracy = body.accuracy != null && Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null;
    return { lat, lng, accuracy };
};

const onlyEmployee = (req, res) => {
    if (!req.user.company) {
        res.status(403).json({ success: false, error: 'Only service engineers can start or end work' });
        return false;
    }
    return true;
};

const shouldSaveAlert = (visit) => {
    const last = visit.outsideAlerts?.[visit.outsideAlerts.length - 1];
    return !last || (Date.now() - new Date(last.at).getTime()) >= ALERT_EVERY_MINUTES * 60 * 1000;
};

// Used by live tracking (POST /api/location): checks the newest point against the open visit.
// Returns null when there is no open visit with a 100 m check.
exports.checkPointAgainstOpenVisit = async (employeeId, point) => {
    if (!point) return null;
    const visit = await ServiceVisit.findOne({ employee: employeeId, status: 'Started', geofenceRequired: true });
    if (!visit || !visit.startLocation) return null;

    const distance = Math.round(distanceMeters(visit.startLocation, point));
    const inside = distance <= visit.radiusMeters;

    if (!inside && shouldSaveAlert(visit)) {
        visit.outsideAlerts.push({ type: 'tracking', lat: point.lat, lng: point.lng, accuracy: point.accuracy, distanceMeters: distance });
        await visit.save();
    }

    return {
        serviceId: visit.service,
        inside,
        distanceMeters: distance,
        radiusMeters: visit.radiusMeters,
        warning: inside ? null : `You are ${distance} m away from the service site. Stay within ${visit.radiusMeters} m.`,
    };
};

// ---------- Engineer (mobile app) ----------

// POST /api/location/visit/start   body: { serviceId, lat, lng, accuracy }
// Engineer taps "Start Work" at the site. This location becomes the site location.
exports.startVisit = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const user = req.user;
        const company = getCompanyId(user);
        const { serviceId } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            return res.status(400).json({ success: false, error: 'Valid serviceId is required' });
        }

        const service = await Service.findOne({ _id: serviceId, company }).select('allotTo workMode status').lean();
        if (!service) {
            return res.status(404).json({ success: false, error: 'Service not found' });
        }
        if (!(service.allotTo || []).some((id) => String(id) === String(user._id))) {
            return res.status(403).json({ success: false, error: 'This service is not assigned to you' });
        }

        // Already started → return the same visit (app restart / double tap)
        const open = await ServiceVisit.findOne({ service: serviceId, employee: user._id, status: 'Started' });
        if (open) {
            return res.status(200).json({ success: true, message: 'Work already started', visit: open });
        }

        // Only one open visit per engineer at a time
        const otherOpen = await ServiceVisit.findOne({ employee: user._id, status: 'Started' }).select('service').lean();
        if (otherOpen) {
            return res.status(409).json({
                success: false,
                code: 'OTHER_VISIT_OPEN',
                error: 'End work on your current service first',
                serviceId: otherOpen.service,
            });
        }

        const geofenceRequired = service.workMode !== 'Remote';
        const point = readPoint(req.body);

        if (geofenceRequired) {
            if (!point) {
                return res.status(400).json({ success: false, error: 'Location (lat, lng) is required to start onsite work' });
            }
            if (point.accuracy != null && point.accuracy > MAX_GPS_ACCURACY_METERS) {
                return res.status(422).json({
                    success: false,
                    code: 'GPS_WEAK',
                    error: `GPS is weak (${Math.round(point.accuracy)} m). Move to an open area and try again.`,
                });
            }
        }

        const visit = await ServiceVisit.create({
            company,
            service: serviceId,
            employee: user._id,
            workMode: service.workMode,
            geofenceRequired,
            radiusMeters: RADIUS_METERS,
            startAt: new Date(),
            startLocation: point || undefined,
        });

        res.status(201).json({
            success: true,
            message: geofenceRequired
                ? `Work started. Stay within ${RADIUS_METERS} m of this location and end work here.`
                : 'Remote work started. No location check for remote service.',
            visit,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while starting work: ' + error.message });
    }
};

// POST /api/location/visit/check   body: { serviceId, lat, lng, accuracy }
// App can call this any time to show "inside / outside 100 m" to the engineer.
exports.checkVisit = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const { serviceId } = req.body || {};
        const point = readPoint(req.body);
        if (!point) {
            return res.status(400).json({ success: false, error: 'Location (lat, lng) is required' });
        }

        const visit = await ServiceVisit.findOne({ service: serviceId, employee: req.user._id, status: 'Started' });
        if (!visit) {
            return res.status(404).json({ success: false, code: 'NO_OPEN_VISIT', error: 'Start work on this service first' });
        }
        if (!visit.geofenceRequired) {
            return res.status(200).json({ success: true, inside: true, geofenceRequired: false, distanceMeters: null, radiusMeters: null, warning: null });
        }

        const distance = Math.round(distanceMeters(visit.startLocation, point));
        const inside = distance <= visit.radiusMeters;

        if (!inside && shouldSaveAlert(visit)) {
            visit.outsideAlerts.push({ type: 'check', lat: point.lat, lng: point.lng, accuracy: point.accuracy, distanceMeters: distance });
            await visit.save();
        }

        res.status(200).json({
            success: true,
            geofenceRequired: true,
            inside,
            distanceMeters: distance,
            radiusMeters: visit.radiusMeters,
            warning: inside ? null : `You are ${distance} m away from the service site. Go back within ${visit.radiusMeters} m to end work.`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while checking location: ' + error.message });
    }
};

// POST /api/location/visit/end   body: { serviceId, lat, lng, accuracy }
// Engineer taps "End Work". Allowed only within 100 m of the start location (Onsite services).
// After success, the app calls the existing service action / complete API as before.
exports.endVisit = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const { serviceId } = req.body || {};

        const visit = await ServiceVisit.findOne({ service: serviceId, employee: req.user._id, status: 'Started' });
        if (!visit) {
            return res.status(404).json({ success: false, code: 'NO_OPEN_VISIT', error: 'Start work on this service first' });
        }

        const point = readPoint(req.body);
        let distance = null;

        if (visit.geofenceRequired) {
            if (!point) {
                return res.status(400).json({ success: false, error: 'Location (lat, lng) is required to end onsite work' });
            }
            if (point.accuracy != null && point.accuracy > MAX_GPS_ACCURACY_METERS) {
                return res.status(422).json({
                    success: false,
                    code: 'GPS_WEAK',
                    error: `GPS is weak (${Math.round(point.accuracy)} m). Move to an open area and try again.`,
                });
            }

            distance = Math.round(distanceMeters(visit.startLocation, point));
            if (distance > visit.radiusMeters) {
                visit.outsideAlerts.push({ type: 'endAttempt', lat: point.lat, lng: point.lng, accuracy: point.accuracy, distanceMeters: distance });
                await visit.save();
                return res.status(403).json({
                    success: false,
                    code: 'OUTSIDE_SITE',
                    error: `You are ${distance} m away from the service site. End work is allowed only within ${visit.radiusMeters} m.`,
                    distanceMeters: distance,
                    radiusMeters: visit.radiusMeters,
                });
            }
        }

        visit.status = 'Ended';
        visit.endAt = new Date();
        visit.endLocation = point || undefined;
        visit.endDistanceMeters = distance;
        await visit.save();

        res.status(200).json({ success: true, message: 'Work ended at site', visit });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while ending work: ' + error.message });
    }
};

// GET /api/location/visit/active
// Engineer's open visit (call when the app opens, to show "End Work" again)
exports.activeVisit = async (req, res) => {
    try {
        if (!onlyEmployee(req, res)) return;
        const visit = await ServiceVisit.findOne({ employee: req.user._id, status: 'Started' }).lean();
        res.status(200).json({ success: true, visit: visit || null });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting active work: ' + error.message });
    }
};

// ---------- Manager (web / reports) ----------

// GET /api/location/visit/service/:serviceId
// All visits of one service with start / end locations and outside alerts
exports.serviceVisits = async (req, res) => {
    try {
        const company = getCompanyId(req.user);
        const { serviceId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(serviceId)) {
            return res.status(400).json({ success: false, error: 'Invalid service id' });
        }

        const visits = await ServiceVisit.find({ company, service: serviceId })
            .populate('employee', 'name')
            .sort({ startAt: -1 })
            .lean();

        res.status(200).json({ success: true, visits });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error while getting visits: ' + error.message });
    }
};