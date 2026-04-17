const Customer = require("../models/customerModel");
const jwt = require("jsonwebtoken");
const CustomerHistory = require("../models/customerHistoryModel");
const Project = require("../models/projectModel");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { logCreation, logUpdate, logDeletion } = require('../helpers/activityLogHelper');

exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("branchOf", "custName email");
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer fetched successfully", customer });
  } catch (error) {
    res.status(500).json({ error: "Error in getting a customer: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const { q, createdBy, ownedBy, priority, industryType, customerType } = req.query;

    const companyId = user.company || user._id;

    let conditions = [{ company: companyId }];

    // ── Search ──
    if (
      q !== undefined && q !== null &&
      q.trim() !== "" && q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"
    ) {
      const searchRegex = new RegExp(q, "i");
      skip = 0;
      page = 1;
      conditions.push({
        $or: [
          { custName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
          { phoneNumber1: { $regex: searchRegex } },
          { industryType: { $regex: searchRegex } },
        ],
      });
    }

    // ── Owned By ──
    if (ownedBy && ownedBy.trim() !== "" && ownedBy.toLowerCase() !== "null") {
      if (ownedBy.trim().toLowerCase() === "na") {
        conditions.push({
          $or: [
            { ownedBy: { $exists: false } },
            { ownedBy: null },
            { ownedBy: "" },
            { ownedBy: { $regex: /^na$/i } },
            { ownedBy: "N/A" },
            { ownedBy: "n/a" },
          ],
        });
      } else {
        conditions.push({ ownedBy: ownedBy.trim() });
      }
    }

    // ── Created By ──
    if (createdBy && createdBy.trim() !== "" && createdBy.toLowerCase() !== "null") {
      try {
        const Employee = require("../models/employeeModel");
        const emp = await Employee.findOne({
          name: createdBy.trim(),
          $or: [{ company: companyId }, { _id: companyId }],
        }).select("_id");

        if (emp) {
          conditions.push({ createdBy: emp._id });
        } else {
          return res.status(200).json({
            success: true,
            customers: [],
            pagination: {
              currentPage: page, totalPages: 0, totalCustomers: 0,
              limit, hasNextPage: false, hasPrevPage: false,
            },
          });
        }
      } catch (empError) {
        console.error("Error finding employee for createdBy filter:", empError);
      }
    }

    // ── Customer Priority ──
    if (priority && priority.trim() !== "") {
      if (priority.trim().toUpperCase() === "NA") {
        conditions.push({
          $or: [
            { customerPriority: { $exists: false } },
            { customerPriority: null },
            { customerPriority: "" },
          ],
        });
      } else {
        conditions.push({ customerPriority: priority.trim().toUpperCase() });
      }
    }

    // ── Industry Type ──
    if (industryType && industryType.trim() !== "") {
      if (industryType.trim().toUpperCase() === "NA") {
        conditions.push({
          $or: [
            { industryType: { $exists: false } },
            { industryType: null },
            { industryType: "" },
          ],
        });
      } else {
        conditions.push({ industryType: industryType.trim() });
      }
    }

    // ── Customer Type ──
    if (customerType && customerType.trim() !== "") {
      conditions.push({ customerType: customerType.trim().toLowerCase() });
    }

    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const totalCustomers = await Customer.countDocuments(query);
    const totalPages = Math.ceil(totalCustomers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const customers = await Customer.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("branchOf", "custName email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      customers,
      pagination: {
        currentPage: page, totalPages, totalCustomers,
        limit, hasNextPage, hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching customers: " + error.message,
    });
  }
};

// ── Get ALL customers for branch selection dropdown ──
exports.getCustomersForBranch = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;
    const { search } = req.query;

    let query = { company: companyId };

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search, "i");
      query = {
        company: companyId,
        $or: [
          { custName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
        ],
      };
    }

    const customers = await Customer.find(query)
      .select("_id custName email GSTNo customerType")
      .sort({ custName: 1 })
      .limit(50000)
      .lean();

    res.status(200).json({ success: true, customers });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching customers: " + error.message });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const user = req.user;

    const {
      custName, billingAddress, email, GSTNo,
      customerContactPersonName1, phoneNumber1,
      customerContactPersonEmail1, customerContactPersonDesignation1,
      customerContactPersonName2, phoneNumber2,
      customerContactPersonEmail2, customerContactPersonDesignation2,
      customerContactPersonName3, phoneNumber3,
      customerContactPersonEmail3, customerContactPersonDesignation3,
      customerContactPersonName4, phoneNumber4,
      customerContactPersonEmail4, customerContactPersonDesignation4,
      customerContactPersonName5, phoneNumber5,
      customerContactPersonEmail5, customerContactPersonDesignation5,
      zone, ownedBy, industryType, industryTypeOther, customerPriority,
      customerType, branchOf,
    } = req.body;

    const existingCustomer = await Customer.findOne({
      company: user.company ? user.company : user._id,
      email: email,
    });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        error: "Customer already exist please use different email Id",
      });
    }

    if (industryType === 'Other' && (!industryTypeOther || industryTypeOther.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: "Please specify the industry type when selecting 'Other'",
      });
    }

    if (!customerPriority || !['P1', 'P2', 'P3'].includes(customerPriority)) {
      return res.status(400).json({
        success: false,
        error: "Customer priority must be P1, P2, or P3",
      });
    }

    if (customerType === 'branch') {
      if (!branchOf) {
        return res.status(400).json({
          success: false,
          error: "Please select a customer for this branch",
        });
      }
      const parentCustomer = await Customer.findById(branchOf);
      if (!parentCustomer) {
        return res.status(400).json({
          success: false,
          error: "Selected customer not found",
        });
      }
    }

    const newCust = new Customer({
      custName,
      GSTNo,
      company: user.company ? user.company : user._id,
      email: email.toLowerCase().trim(),
      createdBy: user._id,
      ownedBy: ownedBy || user.name,
      customerType: customerType || 'main',
      branchOf: customerType === 'branch' ? branchOf : null,
      customerContactPersonName1,
      phoneNumber1: phoneNumber1 || '',
      customerContactPersonEmail1: customerContactPersonEmail1 || '',
      customerContactPersonDesignation1: customerContactPersonDesignation1 || '',
      customerContactPersonName2: customerContactPersonName2 || '',
      phoneNumber2: phoneNumber2 || '',
      customerContactPersonEmail2: customerContactPersonEmail2 || '',
      customerContactPersonDesignation2: customerContactPersonDesignation2 || '',
      customerContactPersonName3: customerContactPersonName3 || '',
      phoneNumber3: phoneNumber3 || '',
      customerContactPersonEmail3: customerContactPersonEmail3 || '',
      customerContactPersonDesignation3: customerContactPersonDesignation3 || '',
      customerContactPersonName4: customerContactPersonName4 || '',
      phoneNumber4: phoneNumber4 || '',
      customerContactPersonEmail4: customerContactPersonEmail4 || '',
      customerContactPersonDesignation4: customerContactPersonDesignation4 || '',
      customerContactPersonName5: customerContactPersonName5 || '',
      phoneNumber5: phoneNumber5 || '',
      customerContactPersonEmail5: customerContactPersonEmail5 || '',
      customerContactPersonDesignation5: customerContactPersonDesignation5 || '',
      billingAddress: billingAddress || { add: '', city: '', state: '', country: '', pincode: '' },
      zone,
      industryType,
      industryTypeOther: industryType === 'Other' ? industryTypeOther : undefined,
      customerPriority,
    });

    const savedCustomer = await newCust.save();

    try {
      await logCreation(savedCustomer, user, req, 'Customer');
    } catch (logError) {
      console.error('Error logging customer creation:', logError);
    }

    await savedCustomer.populate("branchOf", "custName email");

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      customer: savedCustomer,
    });
  } catch (error) {
    console.error('Error in createCustomer:', error);
    if (error.name === "ValidationError") {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ error: "Error creating customer: " + error.message });
    }
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const user = req.user;
    const customerId = req.params.id;

    const branches = await Customer.find({ branchOf: customerId });
    if (branches.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Customer cannot be deleted as it has associated branches. Delete branches first.",
      });
    }

    const projects = await Project.find({ custId: customerId });
    if (projects.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Customer cannot be deleted as they have associated projects.",
      });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer Not Found!!" });
    }

    await logDeletion(customer, user, req, 'Customer');
    await Customer.findByIdAndDelete(customerId);

    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while deleting customer: " + error.message });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const updatedData = req.body;

    const existingCustomer = await Customer.findById(id);
    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    if (updatedData.industryType === 'Other' && (!updatedData.industryTypeOther || updatedData.industryTypeOther.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: "Please specify the industry type when selecting 'Other'",
      });
    }

    if (updatedData.customerPriority && !['P1', 'P2', 'P3'].includes(updatedData.customerPriority)) {
      return res.status(400).json({
        success: false,
        error: "Customer priority must be P1, P2, or P3",
      });
    }

    if (updatedData.customerType === 'branch') {
      if (!updatedData.branchOf) {
        return res.status(400).json({
          success: false,
          error: "Please select a customer for this branch",
        });
      }
      if (updatedData.branchOf === id) {
        return res.status(400).json({
          success: false,
          error: "Customer cannot be a branch of itself",
        });
      }
      const parentCustomer = await Customer.findById(updatedData.branchOf);
      if (!parentCustomer) {
        return res.status(400).json({
          success: false,
          error: "Selected customer not found",
        });
      }
    }

    if (existingCustomer.customerType === 'branch' && updatedData.customerType === 'main') {
      const branches = await Customer.find({ branchOf: id });
      if (branches.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Cannot change to main customer as it has associated branches",
        });
      }
      updatedData.branchOf = null;
    }

    const oldCustomerData = {
      custName: existingCustomer.custName,
      email: existingCustomer.email,
      phoneNumber1: existingCustomer.phoneNumber1,
      phoneNumber2: existingCustomer.phoneNumber2,
      GSTNo: existingCustomer.GSTNo,
      customerContactPersonName1: existingCustomer.customerContactPersonName1,
      customerContactPersonName2: existingCustomer.customerContactPersonName2,
      billingAddress: existingCustomer.billingAddress ? {
        add: existingCustomer.billingAddress.add,
        city: existingCustomer.billingAddress.city,
        state: existingCustomer.billingAddress.state,
        country: existingCustomer.billingAddress.country,
        pincode: existingCustomer.billingAddress.pincode,
      } : {},
      zone: existingCustomer.zone,
      ownedBy: existingCustomer.ownedBy,
      industryType: existingCustomer.industryType,
      industryTypeOther: existingCustomer.industryTypeOther,
      customerPriority: existingCustomer.customerPriority,
      customerType: existingCustomer.customerType,
      branchOf: existingCustomer.branchOf,
      _id: existingCustomer._id,
    };

    let changes = [];
    const trackChanges = (fieldName, oldValue, newValue) => {
      const normalizedOld = (oldValue === undefined || oldValue === null) ? "" : String(oldValue);
      const normalizedNew = (newValue === undefined || newValue === null) ? "" : String(newValue);
      if (normalizedOld !== normalizedNew) {
        changes.push({
          customerId: id,
          fieldName,
          oldValue: normalizedOld,
          newValue: normalizedNew,
          changeReason: req.body.changeReason || "Updated via customer edit",
        });
      }
    };

    trackChanges("custName", existingCustomer.custName, updatedData.custName);
    trackChanges("email", existingCustomer.email, updatedData.email);
    trackChanges("GSTNo", existingCustomer.GSTNo, updatedData.GSTNo);
    trackChanges("ownedBy", existingCustomer.ownedBy, updatedData.ownedBy);
    trackChanges("customerContactPersonName1", existingCustomer.customerContactPersonName1, updatedData.customerContactPersonName1);
    trackChanges("phoneNumber1", existingCustomer.phoneNumber1, updatedData.phoneNumber1);
    trackChanges("customerContactPersonEmail1", existingCustomer.customerContactPersonEmail1, updatedData.customerContactPersonEmail1);
    trackChanges("customerContactPersonDesignation1", existingCustomer.customerContactPersonDesignation1, updatedData.customerContactPersonDesignation1);
    trackChanges("customerContactPersonName2", existingCustomer.customerContactPersonName2, updatedData.customerContactPersonName2);
    trackChanges("phoneNumber2", existingCustomer.phoneNumber2, updatedData.phoneNumber2);
    trackChanges("customerContactPersonEmail2", existingCustomer.customerContactPersonEmail2, updatedData.customerContactPersonEmail2);
    trackChanges("customerContactPersonDesignation2", existingCustomer.customerContactPersonDesignation2, updatedData.customerContactPersonDesignation2);
    trackChanges("zone", existingCustomer.zone, updatedData.zone);
    trackChanges("industryType", existingCustomer.industryType, updatedData.industryType);
    trackChanges("industryTypeOther", existingCustomer.industryTypeOther, updatedData.industryTypeOther);
    trackChanges("customerPriority", existingCustomer.customerPriority, updatedData.customerPriority);
    trackChanges("customerType", existingCustomer.customerType, updatedData.customerType);
    trackChanges("branchOf", existingCustomer.branchOf, updatedData.branchOf);

    if (updatedData.billingAddress) {
      trackChanges("billingAddress.add", existingCustomer.billingAddress?.add, updatedData.billingAddress.add);
      trackChanges("billingAddress.city", existingCustomer.billingAddress?.city, updatedData.billingAddress.city);
      trackChanges("billingAddress.state", existingCustomer.billingAddress?.state, updatedData.billingAddress.state);
      trackChanges("billingAddress.country", existingCustomer.billingAddress?.country, updatedData.billingAddress.country);
      trackChanges("billingAddress.pincode", existingCustomer.billingAddress?.pincode, updatedData.billingAddress.pincode);
    }

    const updatedCustomerDoc = await Customer.findByIdAndUpdate(id, updatedData, {
      new: true, runValidators: true,
    }).populate("createdBy", "name email").populate("branchOf", "custName email");

    const updatedCustomer = {
      custName: updatedCustomerDoc.custName,
      email: updatedCustomerDoc.email,
      phoneNumber1: updatedCustomerDoc.phoneNumber1,
      phoneNumber2: updatedCustomerDoc.phoneNumber2,
      GSTNo: updatedCustomerDoc.GSTNo,
      customerContactPersonName1: updatedCustomerDoc.customerContactPersonName1,
      customerContactPersonName2: updatedCustomerDoc.customerContactPersonName2,
      billingAddress: updatedCustomerDoc.billingAddress ? {
        add: updatedCustomerDoc.billingAddress.add,
        city: updatedCustomerDoc.billingAddress.city,
        state: updatedCustomerDoc.billingAddress.state,
        country: updatedCustomerDoc.billingAddress.country,
        pincode: updatedCustomerDoc.billingAddress.pincode,
      } : {},
      zone: updatedCustomerDoc.zone,
      ownedBy: updatedCustomerDoc.ownedBy,
      industryType: updatedCustomerDoc.industryType,
      industryTypeOther: updatedCustomerDoc.industryTypeOther,
      customerPriority: updatedCustomerDoc.customerPriority,
      customerType: updatedCustomerDoc.customerType,
      branchOf: updatedCustomerDoc.branchOf,
      _id: updatedCustomerDoc._id,
    };

    if (changes.length > 0) {
      await CustomerHistory.insertMany(changes);
    }

    await logUpdate(oldCustomerData, updatedCustomer, user, req, 'Customer');

    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      updatedCustomer: updatedCustomerDoc,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating customer: " + error.message });
  }
};

// ── PDF Export ────────────────────────────────────────────────────────────────
exports.exportCustomersPDF = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonEmail1 customerContactPersonDesignation1 customerContactPersonName2 customerContactPersonEmail2 customerContactPersonDesignation2 createdAt createdBy ownedBy industryType industryTypeOther customerPriority customerType branchOf')
      .populate("createdBy", "name")
      .populate("branchOf", "custName")
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      info: { Title: 'Customer Master Export', Author: 'ProClient360', Subject: 'Customer Data Export', CreationDate: new Date() },
    });

    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) res.status(500).json({ success: false, error: "Error generating PDF: " + err.message });
    });

    doc.pipe(res);

    doc.fontSize(20).fillColor('#2c3e50').text('Customer Master Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#7f8c8d').text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#2c3e50').text(`Total Customers: ${customers.length}`);
    doc.moveDown();

    const tableTop = doc.y;
    const headers = [
      'Sr No', 'Name', 'Email', 'Phone 1', 'Contact 1', 'Email 1', 'Designation 1',
      'Contact 2', 'Email 2', 'Designation 2',
      'GST No', 'Zone', 'Industry', 'Priority', 'Type', 'Branch Of', 'City', 'State', 'Created By', 'Owned By',
    ];
    const columnWidth = [25, 50, 60, 45, 45, 55, 50, 45, 55, 50, 45, 28, 45, 30, 30, 50, 35, 35, 40, 40];
    const rowHeight = 25;

    const drawHeaders = (yPosition) => {
      let currentX = 30;
      doc.rect(30, yPosition, 820, rowHeight).fill('#3498db');
      doc.fillColor('#ffffff');
      doc.fontSize(7);
      headers.forEach((header, i) => {
        doc.text(header, currentX + 2, yPosition + 8, { width: columnWidth[i] - 4 });
        currentX += columnWidth[i];
      });
      return yPosition + rowHeight;
    };

    let yPosition = drawHeaders(tableTop);
    let alternateRow = false;

    customers.forEach((customer, index) => {
      if (yPosition > 500) {
        doc.addPage();
        yPosition = 50;
        yPosition = drawHeaders(yPosition);
      }
      if (alternateRow) doc.rect(30, yPosition, 820, rowHeight).fill('#f8f9fa');
      alternateRow = !alternateRow;

      let currentX = 30;
      doc.fontSize(6).fillColor('#2c3e50');
      const industryDisplay = customer.industryType === 'Other'
        ? (customer.industryTypeOther || 'Other')
        : (customer.industryType || '');

      const rowData = [
        index + 1,
        customer.custName || '',
        customer.email || '',
        customer.phoneNumber1 || '',
        customer.customerContactPersonName1 || '',
        customer.customerContactPersonEmail1 || '',
        customer.customerContactPersonDesignation1 || '',
        customer.customerContactPersonName2 || '',
        customer.customerContactPersonEmail2 || '',
        customer.customerContactPersonDesignation2 || '',
        customer.GSTNo || '',
        customer.zone || '',
        industryDisplay,
        customer.customerPriority || 'P2',
        customer.customerType === 'branch' ? 'Branch' : 'Main',
        customer.branchOf?.custName || '',
        customer.billingAddress?.city || '',
        customer.billingAddress?.state || '',
        customer.createdBy?.name || '',
        customer.ownedBy || '',
      ];

      rowData.forEach((text, i) => {
        doc.text(String(text), currentX + 2, yPosition + 8, { width: columnWidth[i] - 4 });
        currentX += columnWidth[i];
      });
      yPosition += rowHeight;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#95a5a6').text(
        `Page ${i + 1} of ${range.count}`, 30, doc.page.height - 30, { align: 'center' }
      );
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Error generating PDF: " + error.message });
  }
};

// ── Excel Export ──────────────────────────────────────────────────────────────
exports.exportCustomersExcel = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonEmail1 customerContactPersonDesignation1 customerContactPersonName2 customerContactPersonEmail2 customerContactPersonDesignation2 customerContactPersonName3 phoneNumber3 customerContactPersonEmail3 customerContactPersonDesignation3 createdAt createdBy ownedBy industryType industryTypeOther customerPriority customerType branchOf')
      .populate("createdBy", "name email")
      .populate("branchOf", "custName email")
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Customers');

    worksheet.columns = [
      { header: 'Sr No', key: 'srNo', width: 8 },
      { header: 'Customer Name', key: 'custName', width: 25 },
      { header: 'Type', key: 'customerType', width: 10 },
      { header: 'Branch Of', key: 'branchOf', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone 1', key: 'phoneNumber1', width: 18 },
      { header: 'GST No', key: 'GSTNo', width: 15 },
      { header: 'Zone', key: 'zone', width: 10 },
      { header: 'Industry Type', key: 'industryType', width: 25 },
      { header: 'Priority', key: 'customerPriority', width: 10 },
      { header: 'Contact 1 Name', key: 'contactName1', width: 20 },
      { header: 'Contact 1 Phone', key: 'contactPhone1', width: 18 },
      { header: 'Contact 1 Email', key: 'contactEmail1', width: 28 },
      { header: 'Contact 1 Designation', key: 'contactDesig1', width: 22 },
      { header: 'Contact 2 Name', key: 'contactName2', width: 20 },
      { header: 'Contact 2 Phone', key: 'contactPhone2', width: 18 },
      { header: 'Contact 2 Email', key: 'contactEmail2', width: 28 },
      { header: 'Contact 2 Designation', key: 'contactDesig2', width: 22 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Pincode', key: 'pincode', width: 10 },
      { header: 'Created By', key: 'createdByName', width: 15 },
      { header: 'Created By Email', key: 'createdByEmail', width: 25 },
      { header: 'Owned By', key: 'ownedByName', width: 15 },
      { header: 'Created Date', key: 'createdAt', width: 15 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3498db' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    customers.forEach((customer, index) => {
      const industryDisplay = customer.industryType === 'Other'
        ? (customer.industryTypeOther || 'Other')
        : (customer.industryType || '');

      const row = worksheet.addRow({
        srNo: index + 1,
        custName: customer.custName || '',
        customerType: customer.customerType === 'branch' ? 'Branch' : 'Main',
        branchOf: customer.branchOf?.custName || '',
        email: customer.email || '',
        phoneNumber1: customer.phoneNumber1 || '',
        GSTNo: customer.GSTNo || '',
        zone: customer.zone || '',
        industryType: industryDisplay,
        customerPriority: customer.customerPriority || 'P2',
        contactName1: customer.customerContactPersonName1 || '',
        contactPhone1: customer.phoneNumber1 || '',
        contactEmail1: customer.customerContactPersonEmail1 || '',
        contactDesig1: customer.customerContactPersonDesignation1 || '',
        contactName2: customer.customerContactPersonName2 || '',
        contactPhone2: customer.phoneNumber2 || '',
        contactEmail2: customer.customerContactPersonEmail2 || '',
        contactDesig2: customer.customerContactPersonDesignation2 || '',
        address: customer.billingAddress?.add || '',
        city: customer.billingAddress?.city || '',
        state: customer.billingAddress?.state || '',
        country: customer.billingAddress?.country || '',
        pincode: customer.billingAddress?.pincode || '',
        createdByName: customer.createdBy?.name || '',
        createdByEmail: customer.createdBy?.email || '',
        ownedByName: customer.ownedBy || '',
        createdAt: customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '',
      });

      row.height = 20;
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' },
        };
      });

      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f8f9fa' } };
        });
      }
    });

    const summaryRow = worksheet.addRow({
      srNo: '', custName: 'Total Customers:', email: customers.length,
    });
    summaryRow.height = 25;
    summaryRow.eachCell((cell, colNumber) => {
      if (colNumber === 2 || colNumber === 4) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'e8f5e9' } };
      }
    });

    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Error generating Excel: " + error.message });
  }
};