const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');
const { logLeadCreation, logLeadUpdate, logLeadDeletion, logLeadAssignment, logStatusChange, logCallAttempt } = require('../middlewares/activityLogger');

// ── Build IST-correct date range for a YYYY-MM-DD string ──
// Frontend sends "2026-03-04" (IST date).
// We must match leads where QUERY_TIME falls within that IST day.
// IST = UTC+5:30, so IST 00:00 = UTC 18:30 previous day, IST 23:59:59 = UTC 18:29:59 same day.
const getISTDayRange = (dateStr) => {
  // Parse as IST midnight by appending T00:00:00+05:30
  const startIST = new Date(`${dateStr}T00:00:00+05:30`);
  const endIST   = new Date(`${dateStr}T23:59:59.999+05:30`);
  return { startOfDay: startIST, endOfDay: endIST };
};

// ── Build date $or condition ──
const buildDateCondition = (dateStr) => {
  const { startOfDay, endOfDay } = getISTDayRange(dateStr);
  return {
    $or: [
      { QUERY_TIME: { $gte: startOfDay, $lte: endOfDay } },
      { QUERY_TIME: null,              createdAt: { $gte: startOfDay, $lte: endOfDay } },
      { QUERY_TIME: { $exists: false }, createdAt: { $gte: startOfDay, $lte: endOfDay } }
    ]
  };
};

exports.getLeads = async (req, res) => {
  const user = req.user;
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip  = (page - 1) * limit;

  const companyId = new Types.ObjectId(user.company || user._id);
  const { source, date } = req.query;

  const validSources = [
    'TradeIndia', 'IndiaMart', 'Google', 'Tender', 'Exhibitions',
    'JustDial', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube',
    'WhatsApp', 'Referral', 'Email Campaign', 'Cold Call',
    'Website', 'Walk-In', 'Direct', 'Other'
  ];

  try {
    // Validate date early
    if (date) {
      const test = new Date(`${date}T00:00:00+05:30`);
      if (isNaN(test.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
    }

    // ── Table query: pending leads only ──
    const query = { company: companyId, feasibility: 'none' };
    if (source && validSources.includes(source)) query.SOURCE = source;
    if (date) {
      const dc = buildDateCondition(date);
      query.$or = dc.$or;
    }

    const leads = await Lead.find(query)
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit);

    // ── Card counts: build per-feasibility query using $and to avoid $or conflict ──
    const buildCardQuery = (feasibility) => {
      const q = { company: companyId };
      if (source && validSources.includes(source)) q.SOURCE = source;
      if (feasibility) q.feasibility = feasibility;

      if (date) {
        // $and ensures the date $or doesn't conflict with any other $or on q
        q.$and = [buildDateCondition(date)];
      }
      return q;
    };

    const [allLeadsCount, feasibleCount, notFeasibleCount, callUnansweredCount] = await Promise.all([
      Lead.countDocuments(buildCardQuery(null)),
      Lead.countDocuments(buildCardQuery('feasible')),
      Lead.countDocuments(buildCardQuery('not-feasible')),
      Lead.countDocuments(buildCardQuery('call-unanswered')),
    ]);

    res.status(200).json({
      success: true,
      leads,
      allLeadsCount,
      notFeasibleCount,
      feasibleCount,
      callUnansweredCount,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.getCallUnansweredLeads = async (req, res) => {
  const user  = req.user;
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip  = (page - 1) * limit;
  const { source, date } = req.query;

  const validSources = [
    'TradeIndia', 'IndiaMart', 'Google', 'Tender', 'Exhibitions',
    'JustDial', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube',
    'WhatsApp', 'Referral', 'Email Campaign', 'Cold Call',
    'Website', 'Walk-In', 'Direct', 'Other'
  ];

  try {
    const query = {
      company: new Types.ObjectId(user.company || user._id),
      feasibility: 'call-unanswered'
    };
    if (source && validSources.includes(source)) query.SOURCE = source;
    if (date) {
      const dc = buildDateCondition(date);
      query.$or = dc.$or;
    }

    const leads = await Lead.find(query)
      .populate('company', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      leads,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching call unanswered leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.getNotFeasibleLeads = async (req, res) => {
  const user  = req.user;
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip  = (page - 1) * limit;
  const { source, date } = req.query;

  const validSources = [
    'TradeIndia', 'IndiaMart', 'Google', 'Tender', 'Exhibitions',
    'JustDial', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube',
    'WhatsApp', 'Referral', 'Email Campaign', 'Cold Call',
    'Website', 'Walk-In', 'Direct', 'Other'
  ];

  try {
    const query = {
      company: new Types.ObjectId(user.company || user._id),
      feasibility: 'not-feasible'
    };
    if (source && validSources.includes(source)) query.SOURCE = source;
    if (date) {
      const dc = buildDateCondition(date);
      query.$or = dc.$or;
    }

    const leads = await Lead.find(query)
      .populate('company', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      leads,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching not feasible leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.getMyLeads = async (req, res) => {
  const user  = req.user;
  const page  = parseInt(req.query.page)  || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip  = (page - 1) * limit;
  const { source, date, status, callLeads, search, followUpToday } = req.query;

  const validSources = [
    'TradeIndia', 'IndiaMart', 'Google', 'Tender', 'Exhibitions',
    'JustDial', 'Facebook', 'LinkedIn', 'Twitter', 'YouTube',
    'WhatsApp', 'Referral', 'Email Campaign', 'Cold Call',
    'Website', 'Walk-In', 'Direct', 'Other'
  ];

  try {
    const baseQuery = {
      company: new Types.ObjectId(user.company || user._id),
      feasibility: 'feasible'
    };
    if (user.company && user.user !== 'company') {
      baseQuery.assignedTo = new Types.ObjectId(user._id);
    }

    const allLeadsCount = await Lead.countDocuments(baseQuery);

    let query = { ...baseQuery };

    if (source && validSources.includes(source)) query.SOURCE = source;

    if (date) {
      const dc = buildDateCondition(date);
      query.$or = dc.$or;
    }

    if (status) {
      const validStatuses = ['Pending', 'Ongoing', 'Lost', 'Won'];
      if (validStatuses.includes(status)) {
        query.STATUS = status;
      } else {
        return res.status(400).json({ error: 'Invalid status filter.' });
      }
    }

    if (callLeads) {
      const validLeads = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];
      if (validLeads.includes(callLeads)) query.callLeads = callLeads;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { SENDER_COMPANY: searchRegex },
        { SENDER_MOBILE: searchRegex },
        { SENDER_NAME: searchRegex }
      ];
    }

    if (followUpToday === 'true' || followUpToday === true) {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfToday   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      query.nextFollowUpDate = { $gte: startOfToday, $lt: endOfToday };
      delete query.createdAt;
    }

    const leads = await Lead.find(query)
      .populate('company', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalRecords = await Lead.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limit);

    const [
      ongoingCount, winCount, pendingCount, lostCount,
      hotleadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount
    ] = await Promise.all([
      Lead.countDocuments({ ...baseQuery, STATUS: 'Ongoing' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Won' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Pending' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Lost' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Hot Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Warm Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Cold Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Invalid Leads' }),
    ]);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const todaysFollowUpCount = await Lead.countDocuments({
      ...baseQuery,
      nextFollowUpDate: { $gte: startOfToday, $lt: endOfToday }
    });

    const activeQuotationLeads = await Lead.find({
      ...baseQuery, quotation: { $gt: 0 }, STATUS: { $nin: ['Won', 'Lost'] }
    }).lean();
    const totalActiveQuotationAmount = activeQuotationLeads.reduce((s, l) => s + (l.quotation || 0), 0);

    const wonLeads  = await Lead.find({ ...baseQuery, STATUS: 'Won',  quotation: { $gt: 0 } }).lean();
    const lostLeads = await Lead.find({ ...baseQuery, STATUS: 'Lost', quotation: { $gt: 0 } }).lean();
    const totalWonAmount  = wonLeads.reduce((s, l)  => s + (l.quotation || 0), 0);
    const totalLostAmount = lostLeads.reduce((s, l) => s + (l.quotation || 0), 0);

    res.status(200).json({
      success: true,
      leads,
      leadCounts: {
        allLeadsCount,
        ongogingCount: ongoingCount,
        winCount, pendingCount, lostCount,
        hotleadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount,
        todaysFollowUpCount,
      },
      quotationFunnel: {
        totalActiveQuotationAmount,
        activeQuotationLeads,
        totalWonAmount,
        wonLeadsCount: wonLeads.length,
        totalLostAmount,
        lostLeadsCount: lostLeads.length
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching my leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.assignLead = async (req, res) => {
  try {
    const user = req.user;
    const leadId = req.params.id;
    const { feasibility, remark, assignedTo, callHistory } = req.body;

    if (!Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });
    }

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    const oldAssignedTo = lead.assignedTo;

    if (feasibility === 'feasible' || feasibility === 'not-feasible' || feasibility === 'call-unanswered') {
      lead.feasibility = feasibility;
    } else {
      lead.feasibility = 'feasible';
    }

    if (assignedTo) {
      lead.assignedTo = new Types.ObjectId(assignedTo);
    } else if (!lead.assignedTo) {
      lead.assignedTo = new Types.ObjectId(user._id);
    }

    lead.assignedBy   = new Types.ObjectId(user._id);
    lead.assignedTime = new Date();
    lead.remark       = remark || 'Reason not provided';

    if (callHistory && Array.isArray(callHistory)) {
      lead.callHistory = callHistory.map(call => {
        const callEntry = { ...call };
        if (callEntry.attemptedBy && typeof callEntry.attemptedBy === 'string') {
          callEntry.attemptedBy = Types.ObjectId.isValid(callEntry.attemptedBy)
            ? new Types.ObjectId(callEntry.attemptedBy)
            : new Types.ObjectId(user._id);
        } else if (!callEntry.attemptedBy) {
          callEntry.attemptedBy = new Types.ObjectId(user._id);
        }
        return callEntry;
      });

      const uniqueDays = [...new Set(callHistory.map(call => call.day))];
      if (callHistory.length >= 9 || uniqueDays.length >= 3) {
        lead.feasibility = 'call-unanswered';
        if (!remark) lead.remark = 'Automatically marked as call-unanswered after 3 days of call attempts';
      }
    }

    await lead.save();

    if (assignedTo && String(oldAssignedTo) !== String(assignedTo)) {
      const assignedEmployee = await require('../models/employeeModel').findById(assignedTo);
      await logLeadAssignment(lead, assignedEmployee, user, req);
    }

    const savedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');

    res.status(200).json({
      success: true,
      message: 'Lead assigned successfully.',
      data: {
        feasibility: savedLead.feasibility,
        assignedTo:  savedLead.assignedTo,
        callHistory: savedLead.callHistory
      }
    });
  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.submiEnquiry = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status, complated, step, quotation, nextFollowUpDate, previousActions, callLeads } = req.body;

    const lead = await Lead.findOne({ _id: id, company: user.company || user._id });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    if (lead.STATUS === 'Won' || lead.STATUS === 'Lost') {
      return res.status(400).json({
        success: false,
        error: `Cannot update a lead with status "${lead.STATUS}". This lead is already finalized.`
      });
    }

    if (step === '7. Quotation Submission' && quotation) lead.quotation = quotation;

    lead.STATUS          = status;
    lead.complated       = complated || 0;
    lead.step            = step;
    lead.nextFollowUpDate = nextFollowUpDate || null;
    lead.rem             = req.body.rem || lead.rem;
    if (callLeads) lead.callLeads = callLeads;

    if (previousActions && Array.isArray(previousActions)) {
      lead.previousActions = previousActions.map(action => {
        if (typeof action._id === 'string' && !Types.ObjectId.isValid(action._id)) {
          action._id = new Types.ObjectId();
        }
        return action;
      });
    } else {
      if (!lead.previousActions) lead.previousActions = [];
      lead.previousActions.push({
        _id: new Types.ObjectId(),
        status:          status || lead.STATUS,
        step:            step   || lead.step || '1. Call Not Connect/ Callback',
        nextFollowUpDate: nextFollowUpDate || lead.nextFollowUpDate,
        rem:             req.body.rem || lead.rem || '',
        completion:      complated     || lead.complated || 0,
        quotation:       quotation     || lead.quotation || 0,
        callLeads:       callLeads     || lead.callLeads || 'Warm Leads',
        actionBy: { name: user.name || 'System', userId: user._id }
      });
    }

    await lead.save();

    const updatedLead = await Lead.findById(id)
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');

    res.status(200).json({ success: true, message: 'Enquiry submitted successfully.', data: updatedLead });
  } catch (error) {
    console.error('Error submitting enquiry:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.createLead = async (req, res) => {
  try {
    const user = req.user;
    const {
      SENDER_NAME, SENDER_EMAIL, SENDER_MOBILE, SUBJECT, SENDER_COMPANY,
      SENDER_ADDRESS, SENDER_CITY, SENDER_STATE, SENDER_PINCODE, SENDER_COUNTRY_ISO,
      QUERY_PRODUCT_NAME, QUERY_MESSAGE, QUERY_SOURCES_NAME,
      feasibility, assignedTo, assignedBy, assignedTime, customerType, customerId, callLeads
    } = req.body;

    const leadData = {
      SENDER_NAME, SENDER_EMAIL, SENDER_MOBILE, SUBJECT, SENDER_COMPANY,
      SENDER_ADDRESS, SENDER_CITY, SENDER_STATE, SENDER_PINCODE, SENDER_COUNTRY_ISO,
      QUERY_PRODUCT_NAME, QUERY_MESSAGE,
      SOURCE:      QUERY_SOURCES_NAME || 'Direct',
      company:     new Types.ObjectId(user.company || user._id),
      callLeads:   callLeads || 'Warm Leads',
      callHistory: [],
      QUERY_TIME:  new Date(),
      feasibility: feasibility || 'none',
      assignedTo:  assignedTo  ? new Types.ObjectId(assignedTo)  : new Types.ObjectId(user._id),
      assignedBy:  assignedBy  ? new Types.ObjectId(assignedBy)  : new Types.ObjectId(user._id),
      assignedTime: assignedTime || new Date(),
    };

    if (customerType) leadData.customerType = customerType;
    if (customerId)   leadData.customerId   = new Types.ObjectId(customerId);

    const lead = new Lead(leadData);
    await lead.save();
    await logLeadCreation(lead, user, req);

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('customerId', 'custName name');

    res.status(200).json({ success: true, message: 'Lead created successfully.', data: populatedLead });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const updateData = req.body;

    const lead = await Lead.findOne({ _id: id, company: user.company || user._id });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    if (lead.STATUS === 'Won' || lead.STATUS === 'Lost') {
      return res.status(400).json({
        success: false,
        error: `Cannot update a lead with status "${lead.STATUS}". This lead is already finalized.`
      });
    }

    const oldLeadData = lead.toObject();

    if (updateData.previousActions && Array.isArray(updateData.previousActions)) {
      const validSteps = [
        '1. Call Not Connect/ Callback', '2. Requirement Understanding',
        '3. Site Visit', '4. Online Demo', '5. Proof of Concept (POC)',
        '6. Documentation & Planning', '7. Quotation Submission',
        '8. Quotation Discussion', '9. Follow-Up Call', '10. Negotiation Call',
        '11. Negotiation Meetings', '12. Deal Status', '15. Not Feasible'
      ];
      updateData.previousActions = updateData.previousActions.map(action => {
        if (action._id && !Types.ObjectId.isValid(action._id)) action._id = new Types.ObjectId();
        if (!action.step || !validSteps.includes(action.step)) {
          action.step = action.status === 'Won' ? '12. Deal Status'
            : action.status === 'Lost' ? '15. Not Feasible'
            : '1. Call Not Connect/ Callback';
        }
        return action;
      });
    }

    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'company' && key !== 'createdAt' && key !== 'updatedAt') {
        lead[key] = updateData[key];
      }
    });

    await lead.save();
    await logLeadUpdate(oldLeadData, updateData, user, req);

    if (updateData.STATUS && oldLeadData.STATUS !== updateData.STATUS) {
      await logStatusChange(lead, oldLeadData.STATUS, updateData.STATUS, user, req);
    }

    const updatedLead = await Lead.findById(id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    res.status(200).json({ success: true, message: 'Lead updated successfully.', data: updatedLead });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const user   = req.user;
    const leadId = req.params.id;

    if (!Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });
    }

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    if (lead.STATUS === 'Won' || lead.STATUS === 'Lost') {
      return res.status(400).json({
        success: false,
        error: `Cannot delete a lead with status "${lead.STATUS}". This lead is already finalized.`
      });
    }

    await logLeadDeletion(lead, user, req);
    await Lead.deleteOne({ _id: leadId, company: user.company || user._id });

    res.status(200).json({ success: true, message: 'Lead deleted successfully.' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};