// Outbound campaign dialer: calls pending campaign leads within calling hours, a few at a time, with retries.
const cfg = require('../config');
const { withinCallingHours } = require('./compliance');
const { startCall, CallNotAllowed } = require('./callService');
const { Call, Campaign, CampaignLead, Lead } = require('../models');

const ACTIVE = ['queued', 'scheduled', 'prepared', 'initiated', 'ringing', 'in-progress', 'call-disconnected'];

async function runDialerOnce(now = new Date()) {
  const report = { started: 0, skipped: 0, errors: 0, reason: null };
  if (!withinCallingHours(now)) { report.reason = 'outside calling hours'; return report; }

  const stale = new Date(Date.now() - 30 * 60000); // ignore calls stuck "active" for 30+ min (missed webhook)
  const active = await Call.countDocuments({ direction: 'outbound', status: { $in: ACTIVE }, createdAt: { $gt: stale } });
  const slots = cfg.MAX_CONCURRENT_CALLS - active;
  if (slots <= 0) { report.reason = 'all lines busy'; return report; }

  const running = await Campaign.find({ status: 'running' }).select('_id');
  const due = await CampaignLead.find({
    campaign: { $in: running.map((c) => c._id) },
    status: 'pending',
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }],
  }).sort({ attempts: 1, _id: 1 }).limit(slots);

  for (const cl of due) {
    const lead = await Lead.findById(cl.lead);
    try {
      if (!lead) throw new CallNotAllowed('Lead deleted');
      await startCall(lead, { campaignLead: cl, checkHours: false });
      report.started += 1;
    } catch (err) {
      if (err instanceof CallNotAllowed) {
        cl.status = 'skipped'; cl.skipReason = String(err.message).slice(0, 120); await cl.save();
        report.skipped += 1;
      } else {
        console.error('[dialer] call failed', err.message);
        report.errors += 1;
      }
    }
  }

  for (const camp of await Campaign.find({ status: 'running' })) {
    const left = await CampaignLead.countDocuments({ campaign: camp._id, status: { $in: ['pending', 'calling'] } });
    if (!left) { camp.status = 'completed'; await camp.save(); }
  }
  return report;
}

function startDialer() {
  const tick = async () => {
    try {
      const r = await runDialerOnce();
      if (r.started || r.skipped || r.errors) console.log('[dialer]', r);
    } catch (e) { console.error('[dialer] error', e.message); }
  };
  return setInterval(tick, cfg.WORKER_INTERVAL_SECONDS * 1000);
}

module.exports = { runDialerOnce, startDialer };
