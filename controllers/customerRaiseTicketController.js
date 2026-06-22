const CustomerRaiseTicket = require('../models/customerRaiseTicketModel');
const Customer = require('../models/customerModel');
const { logCreation, logDeletion } = require('../helpers/activityLogHelper');

// ── Create Raise Ticket ──
exports.createRaiseTicket = async (req, res) => {
  try {
    const user = req.user;
    const { customer: customerId, contacts } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: 'Customer ID is required' });
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one contact is required' });
    }

    if (contacts.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 contacts allowed' });
    }

    // Validate each contact
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      if (!c.contactPersonName || c.contactPersonName.trim() === '') {
        return res.status(400).json({
          success: false,
          error: `Contact Person Name is required for contact ${i + 1}`,
        });
      }
    }

    // Verify customer exists and belongs to same company
    const companyId = user.company || user._id;
    const customer = await Customer.findOne({ _id: customerId, company: companyId });
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const ticket = new CustomerRaiseTicket({
      customer: customerId,
      company: companyId,
      raisedBy: user._id,
      contacts: contacts.map(c => ({
        contactPersonName: c.contactPersonName.trim(),
        contactNumber: (c.contactNumber || '').trim(),
        contactEmail: (c.contactEmail || '').trim(),
        designation: (c.designation || '').trim(),
        location: (c.location || '').trim(),
      })),
    });

    const savedTicket = await ticket.save();

    // Log activity
    try {
      await logCreation({
        ...savedTicket.toObject(),
        _id: savedTicket._id,
        custName: customer.custName,
      }, user, req, 'CustomerRaiseTicket');
    } catch (logErr) {
      console.error('Error logging raise ticket creation:', logErr);
    }

    res.status(201).json({
      success: true,
      message: 'Ticket raised successfully',
      ticket: savedTicket,
    });
  } catch (error) {
    console.error('Error creating raise ticket:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, error: messages.join(', ') });
    }
    res.status(500).json({ success: false, error: 'Error raising ticket: ' + error.message });
  }
};

// ── Get All Tickets for a Customer ──
exports.getTicketsByCustomer = async (req, res) => {
  try {
    const user = req.user;
    const { customerId } = req.params;
    const companyId = user.company || user._id;

    const tickets = await CustomerRaiseTicket.find({
      customer: customerId,
      company: companyId,
    })
      .populate('raisedBy', 'name')
      .populate('customer', 'custName email')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      tickets,
      total: tickets.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching tickets: ' + error.message });
  }
};

// ── Get Single Ticket ──
exports.getTicketById = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const ticket = await CustomerRaiseTicket.findOne({
      _id: req.params.id,
      company: companyId,
    })
      .populate('raisedBy', 'name')
      .populate('customer', 'custName email');

    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.status(200).json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching ticket: ' + error.message });
  }
};

// ── Update Ticket ──
exports.updateRaiseTicket = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { contacts } = req.body;
    const companyId = user.company || user._id;

    const ticket = await CustomerRaiseTicket.findOne({ _id: id, company: companyId });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    if (contacts && Array.isArray(contacts)) {
      if (contacts.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one contact is required' });
      }
      if (contacts.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 contacts allowed' });
      }
      for (let i = 0; i < contacts.length; i++) {
        if (!contacts[i].contactPersonName || contacts[i].contactPersonName.trim() === '') {
          return res.status(400).json({
            success: false,
            error: `Contact Person Name is required for contact ${i + 1}`,
          });
        }
      }
      ticket.contacts = contacts.map(c => ({
        contactPersonName: c.contactPersonName.trim(),
        contactNumber: (c.contactNumber || '').trim(),
        contactEmail: (c.contactEmail || '').trim(),
        designation: (c.designation || '').trim(),
        location: (c.location || '').trim(),
      }));
    }

    const updatedTicket = await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully',
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error('Error updating raise ticket:', error);
    res.status(500).json({ success: false, error: 'Error updating ticket: ' + error.message });
  }
};

// ── Delete Ticket ──
exports.deleteRaiseTicket = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const ticket = await CustomerRaiseTicket.findOne({ _id: req.params.id, company: companyId });
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    try {
      await logDeletion(ticket, user, req, 'CustomerRaiseTicket');
    } catch (logErr) {
      console.error('Error logging ticket deletion:', logErr);
    }

    await CustomerRaiseTicket.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error deleting ticket: ' + error.message });
  }
};