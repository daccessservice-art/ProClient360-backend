const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');

exports.getLeads = async (req, res) => {
  const user = req.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {
    company: new Types.ObjectId(user.company || user._id),
    feasibility: "none"
  };
  const { source, date, status, callLeads } = req.query;

  try {
    const validSources = [
      'TradeIndia',
      'IndiaMart',
      'Google',
      'Tender',
      'Exhibitions',
      'JustDial',
      'Facebook',
      'LinkedIn',
      'Twitter',
      'YouTube',
      'WhatsApp',
      'Referral',
      'Email Campaign',
      'Cold Call',
      'Website',
      'Walk-In',
      'Direct',
      'Other'
    ];

    if (source && validSources.includes(source)) {
      query.SOURCE = source;
    }

    const validStatuses = ['Pending', 'Ongoing', 'Lost', 'Won'];
    if (status && validStatuses.includes(status)) {
      query.STATUS = status;
    }

    if (callLeads) {
      const validLeads = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];
      if (validLeads.includes(callLeads)) {
        query.callLeads = callLeads;
      }
    }

    if (date) {
      const inputDate = new Date(date);
      if (isNaN(inputDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      const startOfDay = new Date(inputDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(inputDate.setHours(23, 59, 59, 999));

      query.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    }

    const leads = await Lead.find(query)
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const allLeadsCount = await Lead.countDocuments({ company: new Types.ObjectId(user.company || user._id) });
    const notFeasibleCount = await Lead.countDocuments({ company: new Types.ObjectId(user.company || user._id), feasibility: 'not-feasible'});
    const feasibleCount = await Lead.countDocuments({ company: new Types.ObjectId(user.company || user._id), feasibility: 'feasible' });
    const callUnansweredCount = await Lead.countDocuments({ company: new Types.ObjectId(user.company || user._id), feasibility: 'call-unanswered'});

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
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.getCallUnansweredLeads = async (req, res) => {
  const user = req.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {
    company: new Types.ObjectId(user.company || user._id),
    feasibility: "call-unanswered"
  };
  const { source, date } = req.query;

  try {
    const validSources = [
      'TradeIndia',
      'IndiaMart',
      'Google',
      'Tender',
      'Exhibitions',
      'JustDial',
      'Facebook',
      'LinkedIn',
      'Twitter',
      'YouTube',
      'WhatsApp',
      'Referral',
      'Email Campaign',
      'Cold Call',
      'Website',
      'Walk-In',
      'Direct',
      'Other'
    ];

    if (source && validSources.includes(source)) {
      query.SOURCE = source;
    }

    if (date) {
      const inputDate = new Date(date);
      if (isNaN(inputDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }

      const startOfDay = new Date(inputDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(inputDate.setHours(23, 59, 59, 999));

      query.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
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
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      leads,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error('Error fetching call unanswered leads:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
};

exports.getMyLeads = async (req, res) => {
  const user = req.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  let query = {
    company: new Types.ObjectId(user.company || user._id),
    feasibility: "feasible"
  };

  if (user.company && user.user !== 'company') {
    query.assignedTo = new Types.ObjectId(user._id);
    console.log('Regular sales employee - filtering by assignedTo:', user._id);
  } else {
    console.log('Company admin - showing all feasible leads');
  }

  const { source, date, status, callLeads, search, followUpToday } = req.query;

  try {
    const baseQuery = {
      company: new Types.ObjectId(user.company || user._id),
      feasibility: "feasible"
    };
   
    if (user.company && user.user !== 'company') {
      baseQuery.assignedTo = new Types.ObjectId(user._id);
    }

    const allLeadsCount = await Lead.countDocuments(baseQuery);
    console.log('Total leads count:', allLeadsCount);

    const validSources = [
      'TradeIndia',
      'IndiaMart',
      'Google',
      'Tender',
      'Exhibitions',
      'JustDial',
      'Facebook',
      'LinkedIn',
      'Twitter',
      'YouTube',
      'WhatsApp',
      'Referral',
      'Email Campaign',
      'Cold Call',
      'Website',
      'Walk-In',
      'Direct',
      'Other'
    ];

    if (source && validSources.includes(source)) {
      query.SOURCE = source;
    }

    if (date) {
      const inputDate = new Date(date);
      if (isNaN(inputDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      query.createdAt = {
        $gte: new Date(inputDate.setHours(0, 0, 0, 0)),
        $lt: new Date(inputDate.setHours(23, 59, 59, 999)),
      };
    }

    if (status) {
      const validStatuses = ['Pending', 'Ongoing', 'Lost', 'Won'];
      if (validStatuses.includes(status)) {
        query.STATUS = status;
      } else {
        return res.status(400).json({ error: 'Invalid status filter. Valid options are: Pending, Ongoing, Lost, Won.' });
      }
    }

    if (callLeads) {
      const validLeads = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];
      if (validLeads.includes(callLeads)) {
        query.callLeads = callLeads;
        console.log('Filtering by callLeads:', callLeads);
      }
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
      console.log('Applying followUpToday filter');
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
     
      console.log('Filtering for follow-ups between:', startOfToday, 'and', endOfToday);
     
      query.nextFollowUpDate = {
        $gte: startOfToday,
        $lt: endOfToday
      };
     
      delete query.createdAt;
    }

    console.log('Executing query with filters:', JSON.stringify(query, null, 2));

    const leads = await Lead.find({ ...query })
      .populate('company', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalRecords = await Lead.countDocuments({ ...query });
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const ongoingCount = await Lead.countDocuments({ ...baseQuery, STATUS: 'Ongoing' });
    const winCount = await Lead.countDocuments({ ...baseQuery, STATUS: 'Won' });
    const pendingCount = await Lead.countDocuments({ ...baseQuery, STATUS: 'Pending' });
    const lostCount = await Lead.countDocuments({ ...baseQuery, STATUS: 'Lost' });
   
    const hotleadsCount = await Lead.countDocuments({ ...baseQuery, callLeads: 'Hot Leads' });
    const warmLeadsCount = await Lead.countDocuments({ ...baseQuery, callLeads: 'Warm Leads' });
    const coldLeadsCount = await Lead.countDocuments({ ...baseQuery, callLeads: 'Cold Leads' });
    const invalidLeadsCount = await Lead.countDocuments({ ...baseQuery, callLeads: 'Invalid Leads' });

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const todaysFollowUpCount = await Lead.countDocuments({
      ...baseQuery,
      nextFollowUpDate: {
        $gte: startOfToday,
        $lt: endOfToday
      }
    });

    const activeQuotationLeads = await Lead.find({
      ...baseQuery,
      quotation: { $gt: 0 },
      STATUS: { $nin: ['Won', 'Lost'] }
    }).lean();

    const totalActiveQuotationAmount = activeQuotationLeads.reduce((sum, lead) => sum + (lead.quotation || 0), 0);

    const wonLeads = await Lead.find({
      ...baseQuery,
      STATUS: 'Won',
      quotation: { $gt: 0 }
    }).lean();
    const totalWonAmount = wonLeads.reduce((sum, lead) => sum + (lead.quotation || 0), 0);

    const lostLeads = await Lead.find({
      ...baseQuery,
      STATUS: 'Lost',
      quotation: { $gt: 0 }
    }).lean();
    const totalLostAmount = lostLeads.reduce((sum, lead) => sum + (lead.quotation || 0), 0);

    res.status(200).json({
      success: true,
      leads,
      leadCounts: {
        allLeadsCount,
        ongogingCount: ongoingCount,
        winCount,
        pendingCount,
        lostCount,
        hotleadsCount,
        warmLeadsCount,
        coldLeadsCount,
        invalidLeadsCount,
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
        hasNextPage,
        hasPrevPage,
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

    console.log('=== ASSIGN LEAD CALLED ===');
    console.log('Lead ID:', leadId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', JSON.stringify(user, null, 2));

    if (!Types.ObjectId.isValid(leadId)) {
      console.error('Invalid lead ID format:', leadId);
      return res.status(400).json({ success: false, error: 'Invalid lead ID format.' });
    }

    const lead = await Lead.findOne({ _id: leadId, company: user.company || user._id });

    if (!lead) {
      console.error('Lead not found:', leadId);
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }

    console.log('Lead before assignment:', {
      _id: lead._id,
      feasibility: lead.feasibility,
      assignedTo: lead.assignedTo,
      assignedBy: lead.assignedBy,
      callHistory: lead.callHistory
    });

    // Update feasibility
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
   
    lead.assignedBy = new Types.ObjectId(user._id);
    lead.assignedTime = new Date();
    lead.remark = remark || 'Reason not provided';

    // Handle call history if provided
    if (callHistory && Array.isArray(callHistory)) {
      // Ensure attemptedBy is an ObjectId for each call history entry
      lead.callHistory = callHistory.map(call => {
        const callEntry = { ...call };
        if (callEntry.attemptedBy && typeof callEntry.attemptedBy === 'string') {
          if (Types.ObjectId.isValid(callEntry.attemptedBy)) {
            callEntry.attemptedBy = new Types.ObjectId(callEntry.attemptedBy);
          } else {
            callEntry.attemptedBy = new Types.ObjectId(user._id);
          }
        } else if (!callEntry.attemptedBy) {
          callEntry.attemptedBy = new Types.ObjectId(user._id);
        }
        return callEntry;
      });
      
      // Check if there are 9 calls or calls on 3 different days
      const uniqueDays = [...new Set(callHistory.map(call => call.day))];
      if (callHistory.length >= 9 || uniqueDays.length >= 3) {
        lead.feasibility = 'call-unanswered';
        if (!remark) {
          lead.remark = 'Automatically marked as call-unanswered after 3 days of call attempts';
        }
      }
    }

    console.log('Lead before save:', {
      _id: lead._id,
      feasibility: lead.feasibility,
      assignedTo: lead.assignedTo,
      assignedBy: lead.assignedBy,
      callHistory: lead.callHistory
    });

    await lead.save();
   
    console.log('Lead after save:', {
      _id: lead._id,
      feasibility: lead.feasibility,
      assignedTo: lead.assignedTo,
      assignedBy: lead.assignedBy,
      callHistory: lead.callHistory
    });
   
    const savedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');
    
    console.log('Verified saved lead:', {
      _id: savedLead._id,
      feasibility: savedLead.feasibility,
      assignedTo: savedLead.assignedTo,
      assignedBy: savedLead.assignedBy,
      callHistory: savedLead.callHistory
    });

    const salesMasterQuery = {
      company: new Types.ObjectId(user.company || user._id),
      feasibility: "feasible"
    };
   
    if (user.company && user.user !== 'company') {
      salesMasterQuery.assignedTo = new Types.ObjectId(user._id);
    }
   
    const wouldAppearInSalesMaster = await Lead.findOne(salesMasterQuery);
    console.log('Would lead appear in Sales Master?', !!wouldAppearInSalesMaster);
   
    res.status(200).json({
      success: true,
      message: 'Lead assigned successfully.',
      data: {
        feasibility: savedLead.feasibility,
        assignedTo: savedLead.assignedTo,
        wouldAppearInSalesMaster: !!wouldAppearInSalesMaster,
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

    if (step === '7. Quotation Submission' && quotation) {
      lead.quotation = quotation;
    }

    lead.STATUS = status;
    lead.complated = complated || 0;
    lead.step = step;
    lead.nextFollowUpDate = nextFollowUpDate || null;
    lead.rem = req.body.rem || lead.rem;
   
    if (callLeads) {
      lead.callLeads = callLeads;
    }

    if (previousActions && Array.isArray(previousActions)) {
      lead.previousActions = previousActions.map(action => {
        if (typeof action._id === 'string' && !Types.ObjectId.isValid(action._id)) {
          action._id = new Types.ObjectId();
        }
        return action;
      });
    } else {
      if (!lead.previousActions) {
        lead.previousActions = [];
      }

      const newAction = {
        _id: new Types.ObjectId(),
        status: status || lead.STATUS,
        step: step || lead.step || '1. Call Not Connect/ Callback',
        nextFollowUpDate: nextFollowUpDate || lead.nextFollowUpDate,
        rem: req.body.rem || lead.rem || '',
        completion: complated || lead.complated || 0,
        quotation: quotation || lead.quotation || 0,
        callLeads: callLeads || lead.callLeads || 'Warm Leads',
        actionBy: {
          name: user.name || 'System',
          userId: user._id
        }
      };

      lead.previousActions.push(newAction);
    }

    await lead.save();

    const updatedLead = await Lead.findById(id)
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name');

    res.status(200).json({
      success: true,
      message: 'Enquiry submitted successfully.',
      data: updatedLead
    });
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
      feasibility, assignedTo, assignedBy, assignedTime, customerType, customerId,
      callLeads
    } = req.body;

    console.log('=== CREATE LEAD CALLED ===');
    console.log('User ID:', user._id);
    console.log('User Type:', user.user);
    console.log('Request body feasibility:', feasibility);
    console.log('Request body assignedTo:', assignedTo);
    console.log('Request body assignedBy:', assignedBy);
    console.log('Request body callLeads:', callLeads);

    const leadData = {
      SENDER_NAME,
      SENDER_EMAIL,
      SENDER_MOBILE,
      SUBJECT,
      SENDER_COMPANY,
      SENDER_ADDRESS,
      SENDER_CITY,
      SENDER_STATE,
      SENDER_PINCODE,
      SENDER_COUNTRY_ISO,
      QUERY_PRODUCT_NAME,
      QUERY_MESSAGE,
      SOURCE: QUERY_SOURCES_NAME || 'Direct',
      company: new Types.ObjectId(user.company || user._id),
      callLeads: callLeads || 'Warm Leads',
      callHistory: []
    };

    leadData.feasibility = feasibility || 'none';
   
    console.log('Setting feasibility to:', leadData.feasibility);

    if (assignedTo) {
      leadData.assignedTo = new Types.ObjectId(assignedTo);
      console.log('Lead assigned to:', assignedTo);
    } else {
      leadData.assignedTo = new Types.ObjectId(user._id);
      console.log('No assignedTo provided, assigning to current user:', user._id);
    }

    if (assignedBy) {
      leadData.assignedBy = new Types.ObjectId(assignedBy);
      console.log('Lead assigned by:', assignedBy);
    } else {
      leadData.assignedBy = new Types.ObjectId(user._id);
      console.log('No assignedBy provided, setting to current user:', user._id);
    }

    if (assignedTime) {
      leadData.assignedTime = assignedTime;
    } else {
      leadData.assignedTime = new Date();
    }

    if (customerType) {
      leadData.customerType = customerType;
    }

    if (customerId) {
      leadData.customerId = new Types.ObjectId(customerId);
    }

    console.log('Final lead data to save:', JSON.stringify(leadData, null, 2));

    const lead = new Lead(leadData);
    await lead.save();

    console.log('Lead saved with values:', {
      _id: lead._id,
      feasibility: lead.feasibility,
      assignedTo: lead.assignedTo,
      assignedBy: lead.assignedBy,
      company: lead.company,
      callLeads: lead.callLeads,
      callHistory: lead.callHistory
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('customerId', 'custName name');

    console.log('Lead saved successfully. Lead ID:', lead._id);

    res.status(200).json({
      success: true,
      message: 'Lead created successfully.',
      data: populatedLead
    });
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

    if (updateData.previousActions && Array.isArray(updateData.previousActions)) {
      updateData.previousActions = updateData.previousActions.map(action => {
        if (action._id && !Types.ObjectId.isValid(action._id)) {
          action._id = new Types.ObjectId();
        }

        const validSteps = [
          '1. Call Not Connect/ Callback',
          '2. Requirement Understanding',
          '3. Site Visit',
          '4. Online Demo',
          '5. Proof of Concept (POC)',
          '6. Documentation & Planning',
          '7. Quotation Submission',
          '8. Quotation Discussion',
          '9. Follow-Up Call',
          '10. Negotiation Call',
          '11. Negotiation Meetings',
          '12. Deal Status',
          '15. Not Feasible'
        ];

        if (!action.step || !validSteps.includes(action.step)) {
          if (action.status === 'Won') {
            action.step = '12. Deal Status';
          } else if (action.status === 'Lost') {
            action.step = '15. Not Feasible';
          } else {
            action.step = '1. Call Not Connect/ Callback';
          }
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

    const updatedLead = await Lead.findById(id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully.',
      data: updatedLead
    });

  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const user = req.user;
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

    await Lead.deleteOne({ _id: leadId, company: user.company || user._id });
    res.status(200).json({ success: true, message: 'Lead deleted successfully.' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};