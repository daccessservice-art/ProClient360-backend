const express = require('express');
const router = express.Router();
const twilio = require('twilio');

const Lead = require('../models/Lead');
const CallLog = require('../models/CallLog');

const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID,
  process.env.TWILIO_API_KEY_SECRET,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildStreamTwiml(host, customParams = {}) {
  const paramTags = Object.entries(customParams)
    .map(([key, value]) => `<Parameter name="${key}" value="${escapeXml(String(value))}" />`)
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream">
    ${paramTags}
    </Stream>
  </Connect>
</Response>`;
}

router.post('/incoming-call', (req, res) => {
  const host = req.headers.host;
  res.type('text/xml');
  res.send(buildStreamTwiml(host));
});

router.post('/make-call', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing "to" phone number, e.g. +917755994638' });
  const host = req.headers.host;
  try {
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: buildStreamTwiml(host),
    });
    res.json({ status: 'calling', callSid: call.sid });
  } catch (err) {
    console.error('[CallingAgent] Outbound call failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/call-customer/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const host = req.headers.host;
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const phoneNumber = customer.phone || customer.phoneNumber || customer.mobile;
    if (!phoneNumber) return res.status(400).json({ error: 'This customer has no phone number on file' });

    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: buildStreamTwiml(host, {
        customerId: String(customerId),
        customerName: customer.name || customer.customerName || 'the customer',
      }),
    });

    console.log(`CRM outbound call to ${phoneNumber} — Call SID: ${call.sid}`);
    res.json({ status: 'calling', callSid: call.sid, phone: phoneNumber });
  } catch (err) {
    console.error('[CallingAgent] CRM call-customer failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/cold-call-leads', async (req, res) => {
  const { status = 'New', limit = 10, delaySeconds = 30 } = req.body;
  const host = req.headers.host;

  try {
    const leads = await Lead.find({ status }).limit(Math.min(limit, 50)).lean();
    const callable = leads.filter(l => l.phone || l.phoneNumber || l.mobile);
    const skipped = leads.length - callable.length;

    if (callable.length === 0) {
      return res.json({
        status: 'no_leads_to_call',
        message: `No leads found with status "${status}" that have a phone number.`,
      });
    }

    res.json({
      status: 'batch_started',
      totalLeads: callable.length,
      skippedNoPhone: skipped,
      delaySeconds,
      message: `Started calling ${callable.length} lead(s), ${delaySeconds}s apart.`,
    });

    processLeadBatch(callable, host, delaySeconds);
  } catch (err) {
    console.error('[CallingAgent] Cold call batch failed to start:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

async function processLeadBatch(leads, host, delaySeconds) {
  for (const lead of leads) {
    const phoneNumber = lead.phone || lead.phoneNumber || lead.mobile;
    const leadName = lead.name || lead.leadName || 'there';

    try {
      const call = await twilioClient.calls.create({
        to: phoneNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        twiml: buildStreamTwiml(host, {
          leadId: String(lead._id),
          leadName,
          callType: 'cold-call',
        }),
      });

      console.log(`Called ${leadName} (${phoneNumber}) — Call SID: ${call.sid}`);

      await CallLog.create({
        lead: lead._id,
        phoneNumber,
        direction: 'outbound',
        callType: 'cold-call',
        callSid: call.sid,
        status: 'initiated',
        startedAt: new Date(),
      }).catch(e => console.warn('CallLog save failed:', e.message));
    } catch (err) {
      console.error(`Failed to call ${leadName} (${phoneNumber}):`, err.message);
      await CallLog.create({
        lead: lead._id,
        phoneNumber,
        direction: 'outbound',
        callType: 'cold-call',
        status: 'failed',
        errorMessage: err.message,
        startedAt: new Date(),
      }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
  }
  console.log(`Batch complete — ${leads.length} lead(s) processed.`);
}

router.get('/cold-call-status', async (req, res) => {
  try {
    const recentCalls = await CallLog.find({ callType: 'cold-call' })
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();
    res.json({ recentCalls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'calling-agent' });
});

module.exports = router;