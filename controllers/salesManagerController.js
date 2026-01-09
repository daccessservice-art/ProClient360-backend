const { Types } = require('mongoose');
const Lead = require('../models/leadsModel.js');
const Employee = require('../models/employeeModel.js');
const Department = require('../models/departmentModel.js');

// Get all leads (for "All Leads" option)
exports.getAllLeads = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query for all feasible leads
    const leadQuery = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible'
    };

    // Apply filters
    const { source, date, status, callLeads, searchTerm } = req.query;

    if (source) {
      leadQuery.SOURCE = source;
    }

    if (date) {
      const inputDate = new Date(date);
      if (!isNaN(inputDate.getTime())) {
        leadQuery.createdAt = {
          $gte: new Date(inputDate.setHours(0, 0, 0, 0)),
          $lt: new Date(inputDate.setHours(23, 59, 59, 999)),
        };
      }
    }

    if (status) {
      const validStatuses = ['Pending', 'Ongoing', 'Lost', 'Won'];
      if (validStatuses.includes(status)) {
        leadQuery.STATUS = status;
      }
    }

    if (callLeads) {
      const validLeads = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];
      if (validLeads.includes(callLeads)) {
        leadQuery.callLeads = callLeads;
      }
    }

    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      leadQuery.$or = [
        { SENDER_COMPANY: searchRegex },
        { SENDER_MOBILE: searchRegex },
        { SENDER_NAME: searchRegex }
      ];
    }

    // Fetch leads
    const leads = await Lead.find(leadQuery)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(leadQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    // Calculate statistics
    const baseQuery = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible'
    };

    const [
      allLeadsCount,
      ongoingCount,
      wonCount,
      pendingCount,
      lostCount,
      hotLeadsCount,
      warmLeadsCount,
      coldLeadsCount,
      invalidLeadsCount
    ] = await Promise.all([
      Lead.countDocuments(baseQuery),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Ongoing' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Won' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Pending' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Lost' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Hot Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Warm Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Cold Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Invalid Leads' })
    ]);

    // Calculate today's follow-ups
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

    // Calculate quotation funnel
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
        ongoingCount,
        wonCount,
        pendingCount,
        lostCount,
        hotLeadsCount,
        warmLeadsCount,
        coldLeadsCount,
        invalidLeadsCount,
        todaysFollowUpCount
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
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching all leads:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get all sales employees (not managers) from sales, marketing, or sales & marketing departments
exports.getSalesEmployees = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;

    // Get all departments to find the exact department names
    const departments = await Department.find({
      company: new Types.ObjectId(company)
    }).lean();

    // Filter departments that match our criteria using case-insensitive comparison
    const salesDepartments = departments.filter(d => {
      const deptName = d.name.toLowerCase();
      return deptName === 'sales' || 
             deptName === 'marketing' || 
             deptName === 'sales & marketing' ||
             deptName === 'software sales' ||
             deptName === 'dealer network' ||
             deptName.includes('sales') && deptName.includes('marketing') ||
             deptName.includes('software sales') ||
             deptName.includes('dealer network') ||
             deptName.includes('sales') ||
             deptName.includes('marketing');
    });

    // Get department IDs for more accurate matching
    const departmentIds = salesDepartments.map(d => d._id);

    // Find all employees from sales, marketing, or "sales & marketing" departments
    // Exclude employees who have sales manager permissions
    const salesEmployees = await Employee.find({
      company: new Types.ObjectId(company),
      $or: [
        { 'department.name': { $in: ['Sales', 'Marketing', 'Sales & Marketing', 'Software Sales', 'Dealer Network'] } },
        { 'department': { $in: departmentIds } },
        // Add more flexible matching for department names
        { 'department.name': { $regex: /sales/i } },
        { 'department.name': { $regex: /marketing/i } },
        { 'department.name': { $regex: /software sales/i } },
        { 'department.name': { $regex: /dealer network/i } }
      ],
      // Exclude employees who have both viewLead and updateLead permissions (managers)
      'designation.permissions': { 
        $not: { $all: ['viewLead', 'updateLead'] }
      }
    })
    .populate('designation', 'name permissions')
    .populate('department', 'name')
    .select('name email designation department')
    .lean();

    res.status(200).json({
      success: true,
      salesEmployees
    });
  } catch (error) {
    console.error('Error fetching sales employees:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get all sales managers with their teams
exports.getSalesManagers = async (req, res) => {
  try {
    const user = req.user;
    const company = user.company || user._id;

    // Find all employees who have sales permissions (sales managers)
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

    res.status(200).json({
      success: true,
      salesManagers
    });
  } catch (error) {
    console.error('Error fetching sales managers:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// Get leads for a specific employee (not manager)
exports.getManagerTeamLeads = async (req, res) => {
  try {
    const user = req.user;
    const { employeeId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const company = user.company || user._id;

    // Validate employeeId
    if (!Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, error: 'Invalid employee ID' });
    }

    // Get the employee details
    const employee = await Employee.findOne({
      _id: new Types.ObjectId(employeeId),
      company: new Types.ObjectId(company)
    })
    .populate('designation', 'name permissions')
    .populate('department', 'name')
    .lean();

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Build query for leads assigned to this employee
    const leadQuery = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible',
      assignedTo: new Types.ObjectId(employeeId)
    };

    // Apply filters
    const { source, date, status, callLeads, searchTerm } = req.query;

    if (source) {
      leadQuery.SOURCE = source;
    }

    if (date) {
      const inputDate = new Date(date);
      if (!isNaN(inputDate.getTime())) {
        leadQuery.createdAt = {
          $gte: new Date(inputDate.setHours(0, 0, 0, 0)),
          $lt: new Date(inputDate.setHours(23, 59, 59, 999)),
        };
      }
    }

    if (status) {
      const validStatuses = ['Pending', 'Ongoing', 'Lost', 'Won'];
      if (validStatuses.includes(status)) {
        leadQuery.STATUS = status;
      }
    }

    if (callLeads) {
      const validLeads = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];
      if (validLeads.includes(callLeads)) {
        leadQuery.callLeads = callLeads;
      }
    }

    if (searchTerm) {
      const searchRegex = new RegExp(searchTerm, 'i');
      leadQuery.$or = [
        { SENDER_COMPANY: searchRegex },
        { SENDER_MOBILE: searchRegex },
        { SENDER_NAME: searchRegex }
      ];
    }

    // Fetch leads
    const leads = await Lead.find(leadQuery)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalRecords = await Lead.countDocuments(leadQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    // Calculate statistics
    const baseQuery = {
      company: new Types.ObjectId(company),
      feasibility: 'feasible',
      assignedTo: new Types.ObjectId(employeeId)
    };

    const [
      allLeadsCount,
      ongoingCount,
      wonCount,
      pendingCount,
      lostCount,
      hotLeadsCount,
      warmLeadsCount,
      coldLeadsCount,
      invalidLeadsCount
    ] = await Promise.all([
      Lead.countDocuments(baseQuery),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Ongoing' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Won' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Pending' }),
      Lead.countDocuments({ ...baseQuery, STATUS: 'Lost' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Hot Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Warm Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Cold Leads' }),
      Lead.countDocuments({ ...baseQuery, callLeads: 'Invalid Leads' })
    ]);

    // Calculate today's follow-ups
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

    // Calculate quotation funnel
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
      employee,
      leads,
      leadCounts: {
        allLeadsCount,
        ongoingCount,
        wonCount,
        pendingCount,
        lostCount,
        hotLeadsCount,
        warmLeadsCount,
        coldLeadsCount,
        invalidLeadsCount,
        todaysFollowUpCount
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
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching employee leads:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};