const mongoose = require('mongoose');
const AMCCallLog = require('../models/amcCallLogModel');

// Keep in sync with ALERT_WINDOW_DAYS in OldAMCHistoryGrid.jsx
const ALERT_WINDOW_DAYS = 50;
const DAY_MS = 1000 * 60 * 60 * 24;

const OUTCOMES = [
  'Connected',
  'Interested',
  'Not Answered',
  'Busy',
  'Switched Off / Not Reachable',
  'Call Back Later',
  'Wrong Number',
  'Not Interested',
];

const getCompanyId = (user) => (user.company ? user.company : user._id);
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Finds the already-registered Old AMC History model (registered by oldAMCHistoryRoutes)
let OldAMCModel = null;
const getOldAMCModel = () => {
  if (OldAMCModel) return OldAMCModel;
  const name = mongoose.modelNames().find((n) => /old.?amc/i.test(n));
  if (!name) throw new Error('Old AMC History model is not registered');
  OldAMCModel = mongoose.model(name);
  return OldAMCModel;
};

// ── POST /api/amc-call-log/:amcId  → save one call (date & time = server time) ──
exports.logCall = async (req, res) => {
  try {
    const { amcId } = req.params;
    const user = req.user;
    const companyId = getCompanyId(user);

    if (!isValidId(amcId)) {
      return res.status(400).json({ success: false, error: 'Invalid AMC id' });
    }

    const { outcome, remark, nextFollowUpDate } = req.body || {};
    const cleanRemark = (remark || '').toString().trim();

    if (!cleanRemark) {
      return res.status(400).json({ success: false, error: 'Remark is required for every call' });
    }
    if (cleanRemark.length > 1000) {
      return res.status(400).json({ success: false, error: 'Remark cannot exceed 1000 characters' });
    }
    const cleanOutcome = OUTCOMES.includes(outcome) ? outcome : 'Connected';

    let followUp = null;
    if (nextFollowUpDate) {
      followUp = new Date(nextFollowUpDate);
      if (isNaN(followUp.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid Next Follow-up Date' });
      }
    }

    const OldAMC = getOldAMCModel();
    const amc = await OldAMC.findById(amcId).lean();
    if (!amc || (amc.company && String(amc.company) !== String(companyId))) {
      return res.status(404).json({ success: false, error: 'AMC record not found' });
    }
    if (amc.lost) {
      return res.status(400).json({ success: false, error: 'This AMC is marked as Lost. Remove Lost status first to log calls.' });
    }

    const log = await AMCCallLog.create({
      amc: amc._id,
      company: companyId,
      custName: amc.custName || '',
      phoneNumber: amc.phoneNumber1 ? String(amc.phoneNumber1) : '',
      calledAt: new Date(), // automatic date & time
      outcome: cleanOutcome,
      remark: cleanRemark,
      nextFollowUpDate: followUp,
      calledBy: user._id,
      calledByName: user.name || user.custName || user.email || '',
    });

    // If a follow-up date is given → record becomes In Process with that follow-up date
    if (followUp) {
      await OldAMC.updateOne(
        { _id: amc._id },
        { $set: { inProcess: true, nextFollowUpDate: followUp, lost: false } }
      );
    }

    return res.status(201).json({
      success: true,
      message: `Call saved on ${log.calledAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      data: log,
    });
  } catch (error) {
    console.error('Error in logCall:', error);
    return res.status(500).json({ success: false, error: 'Error while saving call: ' + error.message });
  }
};

// ── GET /api/amc-call-log/:amcId  → full call history of one AMC (newest first) ──
exports.getCallHistory = async (req, res) => {
  try {
    const { amcId } = req.params;
    const companyId = getCompanyId(req.user);

    if (!isValidId(amcId)) {
      return res.status(400).json({ success: false, error: 'Invalid AMC id' });
    }

    const logs = await AMCCallLog.find({ amc: amcId, company: companyId })
      .sort({ calledAt: -1 })
      .lean();

    return res.status(200).json({ success: true, logs, total: logs.length });
  } catch (error) {
    console.error('Error in getCallHistory:', error);
    return res.status(500).json({ success: false, error: 'Error while fetching call history: ' + error.message });
  }
};

// ── POST /api/amc-call-log/summary  body: { ids: [...] } → { [amcId]: { count, lastCallAt, ... } } ──
exports.getCallSummary = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isValidId) : [];

    if (ids.length === 0) {
      return res.status(200).json({ success: true, summary: {} });
    }

    const rows = await AMCCallLog.aggregate([
      { $match: { company: toObjectId(companyId), amc: { $in: ids.map(toObjectId) } } },
      { $sort: { calledAt: -1 } },
      {
        $group: {
          _id: '$amc',
          count: { $sum: 1 },
          lastCallAt: { $first: '$calledAt' },
          lastOutcome: { $first: '$outcome' },
          lastRemark: { $first: '$remark' },
          lastCalledByName: { $first: '$calledByName' },
        },
      },
    ]);

    const summary = {};
    rows.forEach((r) => {
      summary[String(r._id)] = {
        count: r.count,
        lastCallAt: r.lastCallAt,
        lastOutcome: r.lastOutcome,
        lastRemark: r.lastRemark,
        lastCalledByName: r.lastCalledByName,
      };
    });

    return res.status(200).json({ success: true, summary });
  } catch (error) {
    console.error('Error in getCallSummary:', error);
    return res.status(500).json({ success: false, error: 'Error while fetching call summary: ' + error.message });
  }
};

// ── GET /api/amc-call-log/alert-count → AMC expiry alert counts (called vs pending) ──
// An expiring / expired AMC counts as "Called" once at least one call is logged
// inside its alert window (End Date − 50 days onwards). Otherwise it is "Pending Call".
exports.getAlertCount = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const OldAMC = getOldAMCModel();

    const today = startOfDay(new Date());
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + ALERT_WINDOW_DAYS);
    windowEnd.setHours(23, 59, 59, 999);

    const alerts = await OldAMC.find({
      company: companyId,
      lost: { $ne: true },
      endDate: { $ne: null, $lte: windowEnd },
    })
      .select('_id endDate inProcess nextFollowUpDate')
      .lean();

    if (alerts.length === 0) {
      return res.status(200).json({ success: true, totalAlerts: 0, calledCount: 0, pendingCount: 0, followUpDue: 0 });
    }

    const lastCalls = await AMCCallLog.aggregate([
      { $match: { company: toObjectId(companyId), amc: { $in: alerts.map((a) => a._id) } } },
      { $group: { _id: '$amc', lastCallAt: { $max: '$calledAt' } } },
    ]);
    const lastCallMap = {};
    lastCalls.forEach((l) => { lastCallMap[String(l._id)] = l.lastCallAt; });

    let calledCount = 0;
    let followUpDue = 0;

    alerts.forEach((a) => {
      const cycleStart = new Date(startOfDay(a.endDate).getTime() - ALERT_WINDOW_DAYS * DAY_MS);
      const last = lastCallMap[String(a._id)];
      if (last && new Date(last) >= cycleStart) calledCount += 1;

      if (a.inProcess && a.nextFollowUpDate && startOfDay(a.nextFollowUpDate) <= today) {
        followUpDue += 1;
      }
    });

    return res.status(200).json({
      success: true,
      totalAlerts: alerts.length,
      calledCount,
      pendingCount: alerts.length - calledCount,
      followUpDue,
    });
  } catch (error) {
    console.error('Error in getAlertCount:', error);
    return res.status(500).json({ success: false, error: 'Error while fetching alert count: ' + error.message });
  }
};