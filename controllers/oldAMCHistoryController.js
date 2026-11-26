const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const OldAMCHistory = require('../models/oldAMCHistoryModel');
// ── NEW: needed for "Project AMC Alerts" (read-only, Project Master is NOT changed) ──
const Project = require('../models/projectModel');
require('../models/customerModel'); // make sure Customer model is registered for populate()
// ── NEW: needed for "Assign AMC to Sales" (creates a real lead in Sales Master) ──
const { Types } = require('mongoose');
const Lead = require('../models/leadsModel');
const Employee = require('../models/employeeModel');
const { logLeadCreation } = require('../middlewares/activityLogger');
const { notifyLeadAssigned, notifyLeadReassigned } = require('../services/leadNotificationService');

// Lead SOURCE used for AMC renewal leads (also added to Sales Master source filter)
const AMC_LEAD_SOURCE = 'AMC Renewal';

const LEAD_INDUSTRY_TYPES = [
  'IT & Software', 'Manufacturing', 'Construction & Infrastructure', 'Healthcare',
  'Education', 'Retail', 'Banking & Finance', 'Logistics & Supply Chain', 'Hospitality',
  'Real Estate', 'Government & Public Sector', 'Energy & Utilities', 'Telecom',
  'Pharmaceuticals', 'Automotive', 'Dealer', 'Hotel', 'Gym & Club', 'Facility Services',
  'Labour Contractor', 'Security Systems Dealer', 'Other',
];
const LEAD_CALL_TYPES = ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'];

// Fields that belong to the Sales assignment — only the assign endpoint may change them
const SALES_LOCKED_FIELDS = [
  'salesLead', 'salesAssignedTo', 'salesAssignedToName', 'salesAssignType',
  'sentToSales', 'sentToSalesAt', 'sentToSalesByName',
];

// ── NEW: show a project in the AMC alert list starting 2 months (60 days) before its End Date ──
const PROJECT_AMC_ALERT_DAYS = 30;

const HEADER_MAP = {
  custName: ['customer name', 'cust name', 'customername', 'name'],
  customerType: ['customer type', 'type'],
  email: ['email', 'email id', 'e-mail'],
  ownedBy: ['owned by', 'owner', 'handled by'],
  industryType: ['industry type', 'industry'],
  customerPriority: ['customer priority', 'priority'],
  customerContactPersonName1: ['contact person name 1', 'contact person 1', 'contact name 1', 'contact person'],
  phoneNumber1: ['contact person no 1', 'contact number 1', 'phone 1', 'contact no 1', 'phone number 1', 'phone'],
  customerContactPersonEmail1: ['contact person email 1', 'contact email 1'],
  customerContactPersonDesignation1: ['designation 1', 'designation'],
  city: ['city'],
  state: ['state'],
  pincode: ['pincode', 'pin code', 'zip', 'zip code'],
  GSTNo: ['gst number', 'gst no', 'gst', 'gstin'],
  zone: ['zone', 'region'],
  system: ['system', 'systems', 'system name', 'system type'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments'],
  startDate: ['start date', 'amc start date', 'contract start'],
  endDate: ['end date', 'amc end date', 'contract end', 'expiry date'],
  nextFollowUpDate: ['next follow up date', 'next followup date', 'next follow-up date', 'follow up date', 'followup date', 'follow-up date'],
};

const SYSTEM_MAX_LENGTH = 500;
const REMARK_MAX_LENGTH = 2000;

const normalizeHeader = (h) => (h || '').toString().trim().toLowerCase();

const buildHeaderIndex = (headerRow) => {
  const indexMap = {};
  headerRow.forEach((cellValue, colIndex) => {
    const norm = normalizeHeader(cellValue);
    if (!norm) return;
    for (const [field, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(norm) && indexMap[field] === undefined) {
        indexMap[field] = colIndex;
      }
    }
  });
  return indexMap;
};

const parseDateCell = (val) => {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) return val;
  const parsed = new Date(val);
  return isNaN(parsed) ? null : parsed;
};

const capRemark = (val) => {
  if (val === undefined || val === null) return '';
  return String(val).trim().slice(0, REMARK_MAX_LENGTH);
};

const capSystem = (val) => {
  if (val === undefined || val === null) return '';
  return String(val).trim().slice(0, SYSTEM_MAX_LENGTH);
};

// ── Import Excel/CSV — NOTHING is mandatory in the file except a usable Customer Name column. ──
exports.importOldAMCHistory = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    const originalName = req.file.originalname || '';
    const isCsv = originalName.toLowerCase().endsWith('.csv');

    if (isCsv) {
      await workbook.csv.read(require('stream').Readable.from(req.file.buffer));
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, error: 'No sheet found in file' });
    }

    const rows = [];
    worksheet.eachRow((row) => rows.push(row.values.slice(1)));

    if (rows.length < 2) {
      return res.status(400).json({ success: false, error: 'File has no data rows' });
    }

    const headerRow = rows[0];
    const indexMap = buildHeaderIndex(headerRow);

    if (indexMap.custName === undefined) {
      return res.status(400).json({
        success: false,
        error: "Could not find a 'Customer Name' column. Please check your file headers.",
      });
    }

    const importBatch = `IMPORT-${Date.now()}`;
    const dataRows = rows.slice(1);
    const docs = [];
    let skipped = 0;

    dataRows.forEach((row) => {
      const get = (field) => (indexMap[field] !== undefined ? row[indexMap[field]] : undefined);
      const custName = get('custName');

      if (!custName || String(custName).trim() === '') {
        skipped++;
        return;
      }

      const custType = get('customerType') && String(get('customerType')).trim().toLowerCase() === 'branch'
        ? 'branch' : 'main';

      docs.push({
        company: companyId,
        custName: String(custName).trim(),
        customerType: custType,
        email: get('email') ? String(get('email')).trim().toLowerCase() : '',
        ownedBy: get('ownedBy') ? String(get('ownedBy')).trim() : '',
        industryType: get('industryType') ? String(get('industryType')).trim() : '',
        customerPriority: get('customerPriority') ? String(get('customerPriority')).trim().toUpperCase() : '',
        customerContactPersonName1: get('customerContactPersonName1') ? String(get('customerContactPersonName1')).trim() : '',
        phoneNumber1: get('phoneNumber1') ? String(get('phoneNumber1')).trim() : '',
        customerContactPersonEmail1: get('customerContactPersonEmail1') ? String(get('customerContactPersonEmail1')).trim().toLowerCase() : '',
        customerContactPersonDesignation1: get('customerContactPersonDesignation1') ? String(get('customerContactPersonDesignation1')).trim() : '',
        billingAddress: {
          city: get('city') ? String(get('city')).trim() : '',
          state: get('state') ? String(get('state')).trim() : '',
          pincode: get('pincode') ? String(get('pincode')).trim() : '',
        },
        GSTNo: get('GSTNo') ? String(get('GSTNo')).trim().toUpperCase() : '',
        zone: get('zone') ? String(get('zone')).trim() : '',
        system: capSystem(get('system')),
        remark: capRemark(get('remark')),
        startDate: parseDateCell(get('startDate')),
        endDate: parseDateCell(get('endDate')),
        nextFollowUpDate: parseDateCell(get('nextFollowUpDate')),
        inProcess: !!parseDateCell(get('nextFollowUpDate')),
        importBatch,
        importedBy: user._id,
        importedByName: user.name || '',
        sourceFileName: originalName,
      });
    });

    if (docs.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows found to import' });
    }

    await OldAMCHistory.insertMany(docs);

    res.status(201).json({
      success: true,
      message: `Imported ${docs.length} record(s) successfully${skipped > 0 ? `, skipped ${skipped} row(s) with no customer name` : ''}`,
      imported: docs.length,
      skipped,
      importBatch,
    });
  } catch (error) {
    console.error('Old AMC History import error:', error);
    res.status(500).json({ success: false, error: 'Error importing file: ' + error.message });
  }
};

// ── Manual Create (single record) — also used when creating an AMC from a Project alert ──
exports.createOldAMCHistory = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;
    const {
      custName, customerType, email, ownedBy, industryType, customerPriority,
      customerContactPersonName1, phoneNumber1, customerContactPersonEmail1,
      customerContactPersonDesignation1, billingAddress, GSTNo, zone,
      system,
      remark,
      startDate, endDate,
      inProcess,
      nextFollowUpDate,
      sourceProject,      // ── NEW ──
      sourceProjectName,  // ── NEW ──
    } = req.body;

    if (!custName || custName.trim() === '') {
      return res.status(400).json({ success: false, error: 'Customer Name is required' });
    }

    if (system && String(system).length > SYSTEM_MAX_LENGTH) {
      return res.status(400).json({ success: false, error: `System cannot exceed ${SYSTEM_MAX_LENGTH} characters` });
    }

    if (remark && String(remark).length > REMARK_MAX_LENGTH) {
      return res.status(400).json({ success: false, error: `Remark cannot exceed ${REMARK_MAX_LENGTH} characters` });
    }

    // ── NEW: one AMC record per project (prevents duplicates from the alert panel) ──
    if (sourceProject) {
      const already = await OldAMCHistory.findOne({ company: companyId, sourceProject });
      if (already) {
        return res.status(400).json({ success: false, error: 'An AMC record is already created for this project' });
      }
    }

    const newRecord = new OldAMCHistory({
      company: companyId,
      custName: custName.trim(),
      customerType: customerType || 'main',
      email: email ? email.toLowerCase().trim() : '',
      ownedBy: ownedBy || '',
      industryType: industryType || '',
      customerPriority: customerPriority || '',
      customerContactPersonName1: customerContactPersonName1 || '',
      phoneNumber1: phoneNumber1 || '',
      customerContactPersonEmail1: customerContactPersonEmail1 ? customerContactPersonEmail1.toLowerCase().trim() : '',
      customerContactPersonDesignation1: customerContactPersonDesignation1 || '',
      billingAddress: {
        city: billingAddress?.city || '',
        state: billingAddress?.state || '',
        pincode: billingAddress?.pincode || '',
      },
      GSTNo: GSTNo || '',
      zone: zone || '',
      system: capSystem(system),
      remark: capRemark(remark),
      startDate: startDate || null,
      endDate: endDate || null,
      inProcess: inProcess === true || !!nextFollowUpDate,
      nextFollowUpDate: nextFollowUpDate || null,
      sourceProject: sourceProject || null,            // ── NEW ──
      sourceProjectName: sourceProjectName || '',      // ── NEW ──
      importBatch: sourceProject ? 'PROJECT' : 'MANUAL',
      importedBy: user._id,
      importedByName: user.name || '',
      sourceFileName: sourceProject ? 'From Project Master' : 'Manual Entry',
    });

    const saved = await newRecord.save();

    res.status(201).json({
      success: true,
      message: sourceProject ? 'AMC record created from project successfully' : 'AMC history record added successfully',
      record: saved,
    });
  } catch (error) {
    console.error('Error creating old AMC history record:', error);
    res.status(500).json({ success: false, error: 'Error creating record: ' + error.message });
  }
};

exports.getProjectAMCAlerts = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - PROJECT_AMC_ALERT_DAYS);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + PROJECT_AMC_ALERT_DAYS);
    windowEnd.setHours(23, 59, 59, 999);

    const convertedIds = await OldAMCHistory.distinct('sourceProject', {
      company: companyId,
      sourceProject: { $ne: null },
    });

    const computeWarrantyEnd = (p) => {
      if (!p.warrantyStartDate || !p.warrantyMonths) return null;
      const d = new Date(p.warrantyStartDate);
      if (isNaN(d.getTime())) return null;
      d.setMonth(d.getMonth() + Number(p.warrantyMonths));
      return d;
    };

    const candidates = await Project.find({
      company: companyId,
      _id: { $nin: convertedIds },
      $or: [
        { endDate: { $gte: windowStart, $lte: windowEnd } },
        {
          warrantyStartDate: { $exists: true, $ne: null, $type: 'date' },
          warrantyMonths: { $exists: true, $gt: 0 },
        },
      ],
    })
      .select('name custId category purchaseOrderNo projectStatus completeLevel startDate endDate Address warrantyStartDate warrantyMonths')
      .populate('custId')
      .sort({ endDate: 1 })
      .lean();

    const projects = candidates.filter((p) => {
      if (p.endDate) {
        const end = new Date(p.endDate);
        if (!isNaN(end.getTime()) && end >= windowStart && end <= windowEnd) {
          return true;
        }
      }
      const wEnd = computeWarrantyEnd(p);
      if (wEnd && wEnd >= windowStart && wEnd <= windowEnd) {
        return true;
      }
      return false;
    });

    res.status(200).json({
      success: true,
      projects,
      total: projects.length,
      alertDays: PROJECT_AMC_ALERT_DAYS,
      windowStart,
      windowEnd,
    });
  } catch (error) {
    console.error('Error fetching project AMC alerts:', error);
    res.status(500).json({ success: false, error: 'Error fetching project AMC alerts: ' + error.message });
  }
};


// ── Manual Update (single record) ──
exports.updateOldAMCHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const user = req.user;

    const existing = await OldAMCHistory.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    if (!updatedData.custName || updatedData.custName.trim() === '') {
      return res.status(400).json({ success: false, error: 'Customer Name is required' });
    }

    if (updatedData.system && String(updatedData.system).length > SYSTEM_MAX_LENGTH) {
      return res.status(400).json({ success: false, error: `System cannot exceed ${SYSTEM_MAX_LENGTH} characters` });
    }

    if (updatedData.remark && String(updatedData.remark).length > REMARK_MAX_LENGTH) {
      return res.status(400).json({ success: false, error: `Remark cannot exceed ${REMARK_MAX_LENGTH} characters` });
    }

    const finalLost = typeof updatedData.lost === 'boolean' ? updatedData.lost : !!existing.lost;
    const finalRemark = capRemark(updatedData.remark);
    if (finalLost && !finalRemark) {
      return res.status(400).json({ success: false, error: 'Remark is required when marking the record as Lost' });
    }

    let finalInProcess = typeof updatedData.inProcess === 'boolean' ? updatedData.inProcess : existing.inProcess;
    let finalFollowUp = updatedData.nextFollowUpDate !== undefined
      ? (updatedData.nextFollowUpDate || null)
      : existing.nextFollowUpDate;
    if (finalLost) {
      finalInProcess = false;
      finalFollowUp = null;
    } else {
      if (finalFollowUp) finalInProcess = true;
      if (!finalInProcess) finalFollowUp = null;
    }

    // ── NEW: Sales assignment is managed ONLY by POST /:id/assign-sales.
    //    Strip those fields from a normal edit (the grid sends a populated salesLead object). ──
    const cleanData = { ...updatedData };
    SALES_LOCKED_FIELDS.forEach((f) => delete cleanData[f]);
    delete cleanData._id;
    delete cleanData.company;
    delete cleanData.createdAt;
    delete cleanData.updatedAt;

    const updated = await OldAMCHistory.findByIdAndUpdate(
      id,
      {
        ...cleanData,
        email: updatedData.email ? updatedData.email.toLowerCase().trim() : '',
        customerContactPersonEmail1: updatedData.customerContactPersonEmail1
          ? updatedData.customerContactPersonEmail1.toLowerCase().trim() : '',
        system: capSystem(updatedData.system),
        remark: finalRemark,
        startDate: updatedData.startDate || null,
        endDate: updatedData.endDate || null,
        inProcess: finalInProcess,
        nextFollowUpDate: finalFollowUp,
        lost: finalLost,
        lostAt: finalLost ? (existing.lost ? existing.lostAt : new Date()) : null,
        // ── never let an edit break the project link ──
        sourceProject: existing.sourceProject || null,
        sourceProjectName: existing.sourceProjectName || '',
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'AMC history record updated successfully',
      record: updated,
    });
  } catch (error) {
    console.error('Error updating old AMC history record:', error);
    res.status(500).json({ success: false, error: 'Error updating record: ' + error.message });
  }
};

// ══════════════════════════════════════════════════════════════════════
// ── NEW: Assign an AMC to Sales (Self OR another Sales Employee) ──
//    Creates a real Lead in Sales Master (feasible, so it shows in "My Sales Dashboard").
//    If an open lead already exists for this AMC → it is RE-ASSIGNED (no duplicate).
//    If the previous lead is Won / Lost → a NEW lead is created (next renewal cycle).
//
//    POST /api/old-amc-history/:id/assign-sales
//    body: { assignmentType: 'self' | 'employee', assignedTo, products,
//            callLeads, nextFollowUpDate, remark }
// ══════════════════════════════════════════════════════════════════════
exports.assignAMCToSales = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;
    const { id } = req.params;
    const {
      assignmentType = 'self',
      assignedTo,
      products,
      callLeads,
      nextFollowUpDate,
      remark,
    } = req.body || {};

    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid AMC record id' });
    }

    const record = await OldAMCHistory.findOne({ _id: id, company: companyId });
    if (!record) {
      return res.status(404).json({ success: false, error: 'AMC record not found' });
    }
    if (record.lost) {
      return res.status(400).json({ success: false, error: 'This AMC is marked as Lost. Remove "Lost" before assigning it to Sales.' });
    }

    // ── Resolve who the lead goes to ──
    let ownerId;
    let ownerName;
    if (assignmentType === 'employee') {
      if (!assignedTo || !Types.ObjectId.isValid(assignedTo)) {
        return res.status(400).json({ success: false, error: 'Please select a Sales Employee' });
      }
      const emp = await Employee.findOne({ _id: assignedTo, company: companyId }).select('name');
      if (!emp) {
        return res.status(404).json({ success: false, error: 'Selected employee not found in your company' });
      }
      ownerId = emp._id;
      ownerName = emp.name || '';
    } else {
      ownerId = new Types.ObjectId(user._id);
      ownerName = user.name || (user.user === 'company' ? 'Company Admin' : '');
    }

    const followUp = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
    if (followUp && isNaN(followUp.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid follow-up date' });
    }

    // ── Existing OPEN lead → re-assign instead of creating a duplicate ──
    let lead = null;
    let isReassign = false;
    if (record.salesLead) {
      const existingLead = await Lead.findOne({ _id: record.salesLead, company: companyId });
      if (existingLead && !['Won', 'Lost'].includes(existingLead.STATUS)) {
        const oldOwner = existingLead.assignedTo ? String(existingLead.assignedTo) : '';
        existingLead.assignedTo = ownerId;
        existingLead.assignedBy = new Types.ObjectId(user._id);
        existingLead.assignedTime = new Date();
        existingLead.feasibility = 'feasible';
        if (callLeads && LEAD_CALL_TYPES.includes(callLeads)) existingLead.callLeads = callLeads;
        if (followUp) existingLead.nextFollowUpDate = followUp;
        if (products && String(products).trim()) existingLead.QUERY_PRODUCT_NAME = String(products).trim();
        await existingLead.save();
        lead = existingLead;
        isReassign = true;

        if (oldOwner !== String(ownerId)) {
          notifyLeadReassigned(lead, ownerId, user);
        }
      }
    }

    // ── No open lead → create a new one ──
    if (!lead) {
      const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : 'N/A');
      const messageLines = [
        'AMC Renewal lead created from Old AMC History.',
        `Customer: ${record.custName || 'N/A'}`,
        `System: ${record.system || 'N/A'}`,
        `AMC Start: ${fmt(record.startDate)}  |  AMC End: ${fmt(record.endDate)}`,
        `Zone: ${record.zone || 'N/A'}  |  Owned By: ${record.ownedBy || 'N/A'}`,
        record.GSTNo ? `GST: ${record.GSTNo}` : '',
        record.remark ? `AMC Remark: ${record.remark}` : '',
        remark ? `Assign Remark: ${remark}` : '',
      ].filter(Boolean);

      const leadData = {
        company: new Types.ObjectId(companyId),
        SOURCE: AMC_LEAD_SOURCE,
        STATUS: 'Pending',
        feasibility: 'feasible', // ── must be feasible to appear in My Sales Dashboard ──
        callLeads: callLeads && LEAD_CALL_TYPES.includes(callLeads) ? callLeads : 'Warm Leads',
        customerType: 'existing',
        SENDER_COMPANY: record.custName || '',
        SENDER_NAME: record.customerContactPersonName1 || record.custName || '',
        SENDER_EMAIL: record.customerContactPersonEmail1 || record.email || '',
        SENDER_MOBILE: record.phoneNumber1 || '',
        SENDER_CITY: record.billingAddress?.city || '',
        SENDER_STATE: record.billingAddress?.state || '',
        SENDER_PINCODE: record.billingAddress?.pincode || '',
        SENDER_COUNTRY_ISO: 'India',
        SENDER_ADDRESS: [record.billingAddress?.city, record.billingAddress?.state].filter(Boolean).join(', '),
        SUBJECT: `AMC Renewal - ${record.custName || ''}`.trim(),
        QUERY_PRODUCT_NAME: (products && String(products).trim()) || record.system || 'AMC Renewal',
        QUERY_MESSAGE: messageLines.join('\n'),
        QUERY_TIME: new Date(),
        callHistory: [],
        assignedTo: ownerId,
        assignedBy: new Types.ObjectId(user._id),
        assignedTime: new Date(),
        nextFollowUpDate: followUp || undefined,
        createdBy: new Types.ObjectId(user._id),
        createdByName: user.name || (user.user === 'company' ? 'Company Admin' : 'Unknown'),
        isAMCLead: true,
        sourceAMC: record._id,
      };

      if (['P1', 'P2', 'P3'].includes(String(record.customerPriority || '').toUpperCase())) {
        leadData.customerPriority = String(record.customerPriority).toUpperCase();
      }
      if (record.industryType) {
        if (LEAD_INDUSTRY_TYPES.includes(record.industryType)) {
          leadData.industryType = record.industryType;
        } else {
          leadData.industryType = 'Other';
          leadData.industryTypeOther = record.industryType;
        }
      }

      lead = new Lead(leadData);
      await lead.save();

      try { await logLeadCreation(lead, user, req); } catch (e) { console.error('logLeadCreation failed:', e.message); }
      notifyLeadAssigned(lead, ownerId, user); // service skips self-assign
    }

    // ── Update the AMC record ──
    record.salesLead = lead._id;
    record.salesAssignedTo = ownerId;
    record.salesAssignedToName = ownerName;
    record.salesAssignType = assignmentType === 'employee' ? 'employee' : 'self';
    if (!record.sentToSales || !isReassign) {
      record.sentToSalesAt = new Date();
    }
    record.sentToSales = true;
    record.sentToSalesByName = user.name || '';
    // AMC is now being worked on by Sales → mark In Process
    record.inProcess = true;
    if (followUp) record.nextFollowUpDate = followUp;
    await record.save();

    res.status(200).json({
      success: true,
      message: isReassign
        ? `Sales lead re-assigned to ${ownerName || 'selected employee'}`
        : `Sales lead created and assigned to ${assignmentType === 'self' ? 'you' : (ownerName || 'selected employee')}`,
      record,
      leadId: lead._id,
      reassigned: isReassign,
    });
  } catch (error) {
    console.error('Error assigning AMC to sales:', error);
    res.status(500).json({ success: false, error: 'Error assigning AMC to Sales: ' + error.message });
  }
};

// ── Toggle "In Process" for a single record ──
exports.toggleOldAMCHistoryInProcess = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;
    const { id } = req.params;

    const record = await OldAMCHistory.findOne({ _id: id, company: companyId });
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    record.inProcess = typeof req.body?.inProcess === 'boolean'
      ? req.body.inProcess
      : !record.inProcess;
    if (!record.inProcess) record.nextFollowUpDate = null;
    if (record.inProcess) { record.lost = false; record.lostAt = null; }

    await record.save();

    res.status(200).json({
      success: true,
      message: record.inProcess ? 'Marked as In Process' : 'Removed In Process',
      record,
    });
  } catch (error) {
    console.error('Error toggling In Process:', error);
    res.status(500).json({ success: false, error: 'Error updating In Process: ' + error.message });
  }
};

// ── List (paginated, filterable) ──
exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 40;
    let skip = (page - 1) * limit;

    const { q, customerType, zone, ownedBy, customerPriority, importBatch } = req.query;

    let conditions = [{ company: companyId }];

    if (q && q.trim() !== '' && q.trim().toLowerCase() !== 'null') {
      const searchRegex = new RegExp(q, 'i');
      conditions.push({
        $or: [
          { custName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
          { phoneNumber1: { $regex: searchRegex } },
          { system: { $regex: searchRegex } },
          { sourceProjectName: { $regex: searchRegex } }, // ── NEW: search by project name ──
        ],
      });
    }

    if (customerType && customerType.trim() !== '') conditions.push({ customerType: customerType.trim() });
    if (zone && zone.trim() !== '') conditions.push({ zone: zone.trim() });
    if (ownedBy && ownedBy.trim() !== '') conditions.push({ ownedBy: ownedBy.trim() });
    if (customerPriority && customerPriority.trim() !== '') conditions.push({ customerPriority: customerPriority.trim() });
    if (importBatch && importBatch.trim() !== '') conditions.push({ importBatch: importBatch.trim() });

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const totalRecords = await OldAMCHistory.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);

    const records = await OldAMCHistory.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ custName: 1 })
      // ── NEW: live status of the Sales lead created from this AMC ──
      .populate({
        path: 'salesLead',
        select: 'STATUS step complated quotation nextFollowUpDate assignedTo',
        populate: { path: 'assignedTo', select: 'name' },
      })
      .lean();

    res.status(200).json({
      success: true,
      records,
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
    res.status(500).json({ success: false, error: 'Error fetching old AMC history: ' + error.message });
  }
};

// ── Delete a single row ──
exports.deleteOldAMCHistory = async (req, res) => {
  try {
    const record = await OldAMCHistory.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.status(200).json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error deleting record: ' + error.message });
  }
};

// ── Delete an entire import batch ──
exports.deleteImportBatch = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;
    const { batch } = req.params;

    const result = await OldAMCHistory.deleteMany({ company: companyId, importBatch: batch });
    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} record(s) from batch ${batch}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error deleting batch: ' + error.message });
  }
};

// ── Excel Export ──
exports.exportOldAMCHistoryExcel = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const records = await OldAMCHistory.find(query).sort({ custName: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Old AMC History');

    worksheet.columns = [
      { header: 'Sr No', key: 'srNo', width: 8 },
      { header: 'Customer Name', key: 'custName', width: 25 },
      { header: 'Customer Type', key: 'customerType', width: 14 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Owned By', key: 'ownedBy', width: 16 },
      { header: 'Industry Type', key: 'industryType', width: 22 },
      { header: 'Customer Priority', key: 'customerPriority', width: 14 },
      { header: 'Contact Person Name 1', key: 'contactName1', width: 22 },
      { header: 'Contact Person No 1', key: 'contactPhone1', width: 18 },
      { header: 'Contact Person Email 1', key: 'contactEmail1', width: 28 },
      { header: 'Designation 1', key: 'designation1', width: 20 },
      { header: 'City', key: 'city', width: 16 },
      { header: 'State', key: 'state', width: 16 },
      { header: 'Pincode', key: 'pincode', width: 12 },
      { header: 'GST Number', key: 'GSTNo', width: 16 },
      { header: 'Zone', key: 'zone', width: 12 },
      { header: 'System', key: 'system', width: 25 },
      { header: 'Remark', key: 'remark', width: 35 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
      { header: 'In Process', key: 'inProcess', width: 12 },
      { header: 'Next Follow-up Date', key: 'nextFollowUpDate', width: 18 },
      { header: 'Lost', key: 'lost', width: 10 },
      { header: 'Sent To Sales', key: 'sentToSales', width: 14 },
      { header: 'Sent To Sales On', key: 'sentToSalesAt', width: 18 },
      { header: 'Sent To Sales By', key: 'sentToSalesBy', width: 20 },
      { header: 'Sales Assigned To', key: 'salesAssignedToName', width: 22 }, // ── NEW ──
      { header: 'From Project', key: 'sourceProjectName', width: 28 }, // ── NEW ──
      { header: 'Imported On', key: 'importedOn', width: 18 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '8e44ad' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    records.forEach((r, index) => {
      const row = worksheet.addRow({
        srNo: index + 1,
        custName: r.custName || '',
        customerType: r.customerType === 'branch' ? 'Branch' : 'Main',
        email: r.email || '',
        ownedBy: r.ownedBy || '',
        industryType: r.industryType || '',
        customerPriority: r.customerPriority || '',
        contactName1: r.customerContactPersonName1 || '',
        contactPhone1: r.phoneNumber1 || '',
        contactEmail1: r.customerContactPersonEmail1 || '',
        designation1: r.customerContactPersonDesignation1 || '',
        city: r.billingAddress?.city || '',
        state: r.billingAddress?.state || '',
        pincode: r.billingAddress?.pincode || '',
        GSTNo: r.GSTNo || '',
        zone: r.zone || '',
        system: r.system || '',
        remark: r.remark || '',
        startDate: r.startDate ? new Date(r.startDate).toLocaleDateString() : '',
        endDate: r.endDate ? new Date(r.endDate).toLocaleDateString() : '',
        inProcess: r.inProcess ? 'Yes' : 'No',
        nextFollowUpDate: r.nextFollowUpDate ? new Date(r.nextFollowUpDate).toLocaleDateString() : '',
        lost: r.lost ? 'Yes' : 'No',
        sentToSales: r.sentToSales ? 'Yes' : 'No',
        sentToSalesAt: r.sentToSalesAt ? new Date(r.sentToSalesAt).toLocaleDateString() : '',
        sentToSalesBy: r.sentToSalesByName || '',
        salesAssignedToName: r.salesAssignedToName || '',
        sourceProjectName: r.sourceProjectName || '', // ── NEW ──
        importedOn: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '',
      });
      row.eachCell((cell) => { cell.alignment = { vertical: 'middle', wrapText: true }; });
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f5eef8' } };
        });
      }
    });

    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    const filename = `old_amc_history_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Old AMC History Excel export error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Error exporting Excel: ' + error.message });
  }
};

// ── PDF Export ── (unchanged)
exports.exportOldAMCHistoryPDF = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const records = await OldAMCHistory.find(query).sort({ custName: 1 });

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
      info: { Title: 'Old AMC History Export', Author: 'ProClient360', CreationDate: new Date() },
    });

    const filename = `old_amc_history_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    doc.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, error: 'Error generating PDF: ' + err.message });
    });

    doc.pipe(res);

    doc.fontSize(20).fillColor('#2c3e50').text('Old AMC History Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#7f8c8d').text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#2c3e50').text(`Total Records: ${records.length}`);
    doc.moveDown();

    const headers = ['Sr No', 'Name', 'Type', 'Email', 'Owned By', 'Industry', 'Priority', 'Contact 1', 'Phone 1', 'Designation 1', 'City', 'State', 'GST No', 'Zone', 'Start', 'End'];
    const columnWidth = [26, 75, 40, 90, 55, 60, 40, 60, 50, 55, 50, 45, 55, 42, 45, 45];
    const rowHeight = 22;

    const drawHeaders = (y) => {
      let x = 30;
      doc.rect(30, y, 833, rowHeight).fill('#8e44ad');
      doc.fillColor('#ffffff').fontSize(7);
      headers.forEach((h, i) => { doc.text(h, x + 2, y + 7, { width: columnWidth[i] - 4 }); x += columnWidth[i]; });
      return y + rowHeight;
    };

    let y = drawHeaders(doc.y);
    let alt = false;

    records.forEach((r, idx) => {
      if (y > 500) { doc.addPage(); y = drawHeaders(50); }
      if (alt) doc.rect(30, y, 833, rowHeight).fill('#f5eef8');
      alt = !alt;

      let x = 30;
      doc.fontSize(6).fillColor('#2c3e50');
      const rowData = [
        idx + 1, r.custName || '', r.customerType === 'branch' ? 'Branch' : 'Main', r.email || '',
        r.ownedBy || '', r.industryType || '', r.customerPriority || '',
        r.customerContactPersonName1 || '', r.phoneNumber1 || '', r.customerContactPersonDesignation1 || '',
        r.billingAddress?.city || '', r.billingAddress?.state || '', r.GSTNo || '', r.zone || '',
        r.startDate ? new Date(r.startDate).toLocaleDateString() : '',
        r.endDate ? new Date(r.endDate).toLocaleDateString() : '',
      ];
      rowData.forEach((val, i) => { doc.text(String(val), x + 2, y + 7, { width: columnWidth[i] - 4 }); x += columnWidth[i]; });
      y += rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#95a5a6').text(`Page ${i + 1} of ${range.count}`, 30, doc.page.height - 30, { align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error('Old AMC History PDF export error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Error generating PDF: ' + error.message });
  }
};