const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');
const Employee = require('../models/employeeModel.js');
const Department = require('../models/departmentModel.js');

// ══════════════════════════════════════════════════════════════
// ✅ HELPER: Get Current Financial Year Start Date
// ══════════════════════════════════════════════════════════════
const getCurrentFYStartDate = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  const fyStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
  return new Date(`${fyStartYear}-04-01T00:00:00.000Z`);
};

// ══════════════════════════════════════════════════════════════
// ✅ FIXED: getAllLeads - Secure $and structure prevents FY filter overwrite
// ══════════════════════════════════════════════════════════════
exports.getAllLeads = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { source, date, status, callLeads, search, searchTerm } = req.query;

    // ── Base conditions ──
    const baseMatch = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible'
    };
    if (source) baseMatch.SOURCE = source;

    // ✅ FY filter as a SEPARATE $and element
    const currentFYStart = getCurrentFYStartDate();
    const fyFilter = {
      $or: [
        { STATUS: { $in: ['Pending', 'Ongoing'] } },
        { STATUS: { $in: ['Won', 'Lost'] }, updatedAt: { $gte: currentFYStart } }
      ]
    };

    // ── Build $and array ──
    const andConditions = [baseMatch, fyFilter];

    if (date) {
      const inputDate = new Date(date);
      if (!isNaN(inputDate.getTime())) {
        andConditions.push({
          createdAt: {
            $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            $lt: new Date(new Date(date).setHours(23, 59, 59, 999))
          }
        });
      }
    }

    if (status && ['Pending', 'Ongoing', 'Lost', 'Won'].includes(status)) {
      andConditions.push({ STATUS: status });
    }

    if (callLeads && ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'].includes(callLeads)) {
      andConditions.push({ callLeads: callLeads });
    }

    const searchValue = search || searchTerm;
    if (searchValue) {
      const searchRegex = new RegExp(searchValue, 'i');
      const matchingEmployees = await Employee.find({ name: searchRegex }, '_id').lean();
      const employeeIds = matchingEmployees.map(e => e._id);
      
      andConditions.push({
        $or: [
          { SENDER_COMPANY: searchRegex },
          { SENDER_MOBILE: searchRegex },
          { SENDER_NAME: searchRegex },
          ...(employeeIds.length > 0 ? [{ assignedTo: { $in: employeeIds } }] : [])
        ]
      });
    }

    const leadQuery = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    const leads = await Lead.find(leadQuery)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
      
    const totalRecords = await Lead.countDocuments(leadQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    // ── Card counts ──
    const cardBase = { $and: [baseMatch, fyFilter] };

    const [allLeadsCount, ongoingCount, wonCount, pendingCount, lostCount, hotLeadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount] = await Promise.all([
      Lead.countDocuments(cardBase),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Ongoing' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Won' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Pending' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Lost' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Hot Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Warm Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Cold Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Invalid Leads' }] }),
    ]);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const todaysFollowUpCount = await Lead.countDocuments({ $and: [baseMatch, fyFilter, { nextFollowUpDate: { $gte: startOfToday, $lt: endOfToday } }] });

    const activeQuotationLeads = await Lead.find({
      $and: [baseMatch, fyFilter, { quotation: { $gt: 0 } }, { STATUS: { $nin: ['Won', 'Lost'] } }]
    }).lean();
    const totalActiveQuotationAmount = activeQuotationLeads.reduce((sum, lead) => sum + (lead.quotation || 0), 0);

    const wonLeads = await Lead.find({ $and: [baseMatch, fyFilter, { STATUS: 'Won' }, { quotation: { $gt: 0 } }] }).lean();
    const lostLeads = await Lead.find({ $and: [baseMatch, fyFilter, { STATUS: 'Lost' }, { quotation: { $gt: 0 } }] }).lean();

    res.status(200).json({
      success: true,
      leads,
      leadCounts: {
        allLeadsCount, ongoingCount, wonCount, pendingCount, lostCount,
        hotLeadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount, todaysFollowUpCount
      },
      quotationFunnel: {
        totalActiveQuotationAmount,
        activeQuotationLeads,
        totalWonAmount: wonLeads.reduce((s, l) => s + (l.quotation || 0), 0),
        wonLeadsCount: wonLeads.length,
        totalLostAmount: lostLeads.reduce((s, l) => s + (l.quotation || 0), 0),
        lostLeadsCount: lostLeads.length
      },
      pagination: {
        currentPage: page, totalPages, totalRecords, limit,
        hasNextPage: page < totalPages, hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// ── Get all sales employees ──
exports.getSalesEmployees = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;

    const departments = await Department.find({ company: new Types.ObjectId(company) }).lean();

    const salesDepartments = departments.filter(d => {
      const deptName = d.name.toLowerCase();
      return deptName === 'sales' ||
        deptName === 'marketing' ||
        deptName === 'sales & marketing' ||
        deptName === 'software sales' ||
        deptName === 'dealer network' ||
        (deptName.includes('sales') && deptName.includes('marketing')) ||
        deptName.includes('software sales') ||
        deptName.includes('dealer network') ||
        deptName.includes('sales') ||
        deptName.includes('marketing');
    });

    const departmentIds = salesDepartments.map(d => d._id);

    const salesEmployees = await Employee.find({
      company: new Types.ObjectId(company),
      $or: [
        { 'department.name': { $in: ['Sales', 'Marketing', 'Sales & Marketing', 'Software Sales', 'Dealer Network'] } },
        { 'department': { $in: departmentIds } },
        { 'department.name': { $regex: /sales/i } },
        { 'department.name': { $regex: /marketing/i } },
        { 'department.name': { $regex: /software sales/i } },
        { 'department.name': { $regex: /dealer network/i } }
      ],
      'designation.permissions': {
        $not: { $all: ['viewLead', 'updateLead'] }
      }
    })
      .populate('designation', 'name permissions')
      .populate('department', 'name')
      .select('name email designation department')
      .lean();

    res.status(200).json({ success: true, salesEmployees });
  } catch (error) {
    console.error('Error fetching sales employees:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// ── Get all sales managers ──
exports.getSalesManagers = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;

    const salesManagers = await Employee.find({
      company: new Types.ObjectId(company),
      $or: [
        { 'designation.permissions': 'viewLead' },
        { 'designation.permissions': 'updateLead' }
      ]
    })
      .populate('designation', 'name permissions')
      .populate('department', 'name')
      .select('name email designation department')
      .lean();

    res.status(200).json({ success: true, salesManagers });
  } catch (error) {
    console.error('Error fetching sales managers:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// ══════════════════════════════════════════════════════════════
// ✅ FIXED: getManagerTeamLeads - Secure $and structure
// ══════════════════════════════════════════════════════════════
exports.getManagerTeamLeads = async (req, res) => {
  try {
    const user = req.user;
    const { employeeId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const company = user.company || user._id;
    
    if (!Types.ObjectId.isValid(employeeId)) return res.status(400).json({ success: false, error: 'Invalid employee ID' });
    const employee = await Employee.findOne({ _id: new Types.ObjectId(employeeId), company: new Types.ObjectId(company) }).populate('designation', 'name permissions').populate('department', 'name').lean();
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    const { source, date, status, callLeads, search, searchTerm } = req.query;

    // ── Base conditions ──
    const baseMatch = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible',
      assignedTo: new Types.ObjectId(employeeId)
    };
    if (source) baseMatch.SOURCE = source;

    // ✅ FY filter as a SEPARATE $and element
    const currentFYStart = getCurrentFYStartDate();
    const fyFilter = {
      $or: [
        { STATUS: { $in: ['Pending', 'Ongoing'] } },
        { STATUS: { $in: ['Won', 'Lost'] }, updatedAt: { $gte: currentFYStart } }
      ]
    };

    // ── Build $and array ──
    const andConditions = [baseMatch, fyFilter];

    if (date) {
      const inputDate = new Date(date);
      if (!isNaN(inputDate.getTime())) {
        andConditions.push({
          createdAt: {
            $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            $lt: new Date(new Date(date).setHours(23, 59, 59, 999))
          }
        });
      }
    }

    if (status && ['Pending', 'Ongoing', 'Lost', 'Won'].includes(status)) {
      andConditions.push({ STATUS: status });
    }

    if (callLeads && ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'].includes(callLeads)) {
      andConditions.push({ callLeads: callLeads });
    }

    const searchValue = search || searchTerm;
    if (searchValue) {
      const searchRegex = new RegExp(searchValue, 'i');
      const matchingEmployees = await Employee.find({ name: searchRegex }, '_id').lean();
      const employeeIds = matchingEmployees.map(e => e._id);
      
      andConditions.push({
        $or: [
          { SENDER_COMPANY: searchRegex },
          { SENDER_MOBILE: searchRegex },
          { SENDER_NAME: searchRegex },
          ...(employeeIds.length > 0 ? [{ assignedTo: { $in: employeeIds } }] : [])
        ]
      });
    }

    const leadQuery = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };

    const leads = await Lead.find(leadQuery)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
      
    const totalRecords = await Lead.countDocuments(leadQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    // ── Card counts ──
    const cardBase = { $and: [baseMatch, fyFilter] };

    const [allLeadsCount, ongoingCount, wonCount, pendingCount, lostCount, hotLeadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount] = await Promise.all([
      Lead.countDocuments(cardBase),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Ongoing' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Won' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Pending' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { STATUS: 'Lost' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Hot Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Warm Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Cold Leads' }] }),
      Lead.countDocuments({ $and: [baseMatch, fyFilter, { callLeads: 'Invalid Leads' }] }),
    ]);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const todaysFollowUpCount = await Lead.countDocuments({ $and: [baseMatch, fyFilter, { nextFollowUpDate: { $gte: startOfToday, $lt: endOfToday } }] });

    const activeQuotationLeads = await Lead.find({
      $and: [baseMatch, fyFilter, { quotation: { $gt: 0 } }, { STATUS: { $nin: ['Won', 'Lost'] } }]
    }).lean();
    const totalActiveQuotationAmount = activeQuotationLeads.reduce((sum, lead) => sum + (lead.quotation || 0), 0);

    const wonLeads = await Lead.find({ $and: [baseMatch, fyFilter, { STATUS: 'Won' }, { quotation: { $gt: 0 } }] }).lean();
    const lostLeads = await Lead.find({ $and: [baseMatch, fyFilter, { STATUS: 'Lost' }, { quotation: { $gt: 0 } }] }).lean();

    res.status(200).json({
      success: true,
      employee,
      leads,
      leadCounts: {
        allLeadsCount, ongoingCount, wonCount, pendingCount, lostCount,
        hotLeadsCount, warmLeadsCount, coldLeadsCount, invalidLeadsCount, todaysFollowUpCount
      },
      quotationFunnel: {
        totalActiveQuotationAmount,
        activeQuotationLeads,
        totalWonAmount: wonLeads.reduce((s, l) => s + (l.quotation || 0), 0),
        wonLeadsCount: wonLeads.length,
        totalLostAmount: lostLeads.reduce((s, l) => s + (l.quotation || 0), 0),
        lostLeadsCount: lostLeads.length
      },
      pagination: {
        currentPage: page, totalPages, totalRecords, limit,
        hasNextPage: page < totalPages, hasPrevPage: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// ✅ NEW: OLD SALES HISTORY (Only Won & Lost by Financial Year)
// ═══════════════════════════════════════════════════════════════
exports.getOldSalesHistory = async (req, res) => {
  try {
    const user = req.user; const company = user.company || user._id; const page = parseInt(req.query.page) || 1; const limit = parseInt(req.query.limit) || 20; const skip = (page - 1) * limit;
    const { year, source, search, searchTerm } = req.query;
    const startYear = parseInt(year?.split('-')[0]);
    if (isNaN(startYear)) return res.status(400).json({ success: false, error: 'Invalid year format. Use YYYY-YYYY' });

    const fyStartDate = new Date(`${startYear}-04-01T00:00:00.000Z`);
    const fyEndDate = new Date(`${startYear + 1}-04-01T00:00:00.000Z`);

    const baseQuery = { company: new Types.ObjectId(company), STATUS: { $in: ['Won', 'Lost'] }, updatedAt: { $gte: fyStartDate, $lt: fyEndDate } };
    const leadQuery = { ...baseQuery };
    if (source) leadQuery.SOURCE = source;
    const searchValue = search || searchTerm;
    if (searchValue) { const searchRegex = new RegExp(searchValue, 'i'); const matchingEmployees = await Employee.find({ name: searchRegex }, '_id').lean(); const employeeIds = matchingEmployees.map(e => e._id); if (!leadQuery.$and) leadQuery.$and = []; leadQuery.$and.push({ $or: [{ SENDER_COMPANY: searchRegex }, { SENDER_MOBILE: searchRegex }, { SENDER_NAME: searchRegex }, ...(employeeIds.length > 0 ? [{ assignedTo: { $in: employeeIds } }] : [])] }); }

    const leads = await Lead.find(leadQuery).populate('assignedTo', 'name email').populate('assignedBy', 'name email').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
    const totalRecords = await Lead.countDocuments(leadQuery); const totalPages = Math.ceil(totalRecords / limit);

    const [wonCount, lostCount, totalWonAmount, totalLostAmount] = await Promise.all([
      Lead.countDocuments({ ...baseQuery, STATUS: 'Won' }), Lead.countDocuments({ ...baseQuery, STATUS: 'Lost' }),
      Lead.aggregate([{ $match: { ...baseQuery, STATUS: 'Won', quotation: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$quotation" } } }]).then(r => r[0]?.total || 0),
      Lead.aggregate([{ $match: { ...baseQuery, STATUS: 'Lost', quotation: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$quotation" } } }]).then(r => r[0]?.total || 0)
    ]);

    res.status(200).json({ success: true, leads, historyCounts: { totalRecords: wonCount + lostCount, wonCount, lostCount, totalWonAmount, totalLostAmount }, pagination: { currentPage: page, totalPages, totalRecords, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } });
  } catch (error) { res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message }); }
};