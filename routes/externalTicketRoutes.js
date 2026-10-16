const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middlewares/auth');
const Ticket = require('../models/ticketModel');
const ExternalTicket = require('../models/externalTicketModel');

// GET /api/external-ticket/EXT-3
router.get('/:uniqueTicketId', isLoggedIn, async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company ? user.company : user._id;
    const { uniqueTicketId } = req.params;

    if (!/^EXT-\d+$/.test(uniqueTicketId)) {
      return res.status(400).json({ success: false, error: 'Not an external ticket' });
    }

    const ticket = await Ticket.findOne({ uniqueTicketId, company: companyId })
      .select('_id uniqueTicketId')
      .lean();
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const ext = await ExternalTicket.findOne({
      externalId: Number(uniqueTicketId.replace('EXT-', '')),
    }).lean();
    if (!ext) {
      return res.status(404).json({ success: false, error: 'External details not saved for this ticket' });
    }

    res.status(200).json({ success: true, uniqueTicketId, data: ext.data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error: ' + error.message });
  }
});

// Fields the support (SmartGate) API lets us change
const EDITABLE = [
  'Ticket_Status', 'Ticket_Priority', 'Ticket_Category', 'Ticket_Details',
  'Ticket_Closing_Date', 'Assignee_ID', 'Assignee_Name', 'Assignee_Email', 'Comment',
];

// PATCH /api/external-ticket/EXT-45  ->  PATCH <support api>/tickets/T1031
router.patch('/:uniqueTicketId', isLoggedIn, async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company ? user.company : user._id;
    const { uniqueTicketId } = req.params;

    if (!/^EXT-\d+$/.test(uniqueTicketId)) {
      return res.status(400).json({ success: false, error: 'Not an external ticket' });
    }
    if (!process.env.EXTERNAL_TICKETS_URL || !process.env.EXTERNAL_TICKETS_TOKEN) {
      return res.status(500).json({ success: false, error: 'External API is not configured' });
    }

    const ticket = await Ticket.findOne({ uniqueTicketId, company: companyId }).select('_id').lean();
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const ext = await ExternalTicket.findOne({
      externalId: Number(uniqueTicketId.replace('EXT-', '')),
    });
    if (!ext) return res.status(404).json({ success: false, error: 'External details not saved for this ticket' });

    const raw = ext.data?.ticket || ext.data || {};
    const ticketNo = raw.Ticket_No;
    if (!ticketNo) return res.status(404).json({ success: false, error: 'External ticket number missing' });

    const body = {};
    EDITABLE.forEach((k) => {
      if (req.body[k] !== undefined) body[k] = req.body[k];
    });
    if (!Object.keys(body).length) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30 * 1000);
    let apiRes;
    try {
      apiRes = await fetch(`${process.env.EXTERNAL_TICKETS_URL}/${encodeURIComponent(ticketNo)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.EXTERNAL_TICKETS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await apiRes.text();
    let payload; try { payload = JSON.parse(text); } catch (_) { payload = { message: text }; }
    if (!apiRes.ok) {
      return res.status(apiRes.status === 401 ? 502 : apiRes.status).json({
        success: false,
        error: payload?.error || payload?.message || `External API status ${apiRes.status}`,
      });
    }

    // keep our stored copy in step with what we just sent
    const target = ext.data?.ticket ? 'data.ticket' : 'data';
    const set = {};
    Object.entries(body).forEach(([k, v]) => { set[`${target}.${k}`] = v; });
    await ExternalTicket.updateOne({ _id: ext._id }, { $set: set });
    if (body.Ticket_Details) {
      await Ticket.updateOne({ _id: ticket._id }, { $set: { details: String(body.Ticket_Details).slice(0, 500) } });
    }

    res.status(200).json({ success: true, message: 'SmartGate ticket updated', ticketNo });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error: ' + error.message });
  }
});

module.exports = router;