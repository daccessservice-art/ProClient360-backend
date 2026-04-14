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
      .populate("createdBy", "name email");
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer fetched successfully", customer });
  } catch (error) {
    res.status(500).json({ error: "Error in getting a customer: " + error.message });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📄 FILE: controllers/customerController.js (ONLY update the showAll function)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const { q, createdBy, ownedBy } = req.query;

    const companyId = user.company || user._id;
    
    // ✅ Build query with proper $and structure for complex filters
    let conditions = [{ company: companyId }];

    // ── Search filter ──
    if (
      q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
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

    // ✅ FIXED: Owned By filter — handle "NA" to find customers with no owner
    if (ownedBy && ownedBy.trim() !== "" && ownedBy.toLowerCase() !== "null") {
      if (ownedBy.trim().toLowerCase() === "na") {
        // Find customers with no owner or owner is NA/N/A/empty
        conditions.push({
          $or: [
            { ownedBy: { $exists: false } },
            { ownedBy: null },
            { ownedBy: "" },
            { ownedBy: { $regex: /^na$/i } },
            { ownedBy: "N/A" },
            { ownedBy: "n/a" }
          ]
        });
      } else {
        conditions.push({ ownedBy: ownedBy.trim() });
      }
    }

    // ✅ Created By filter — createdBy is a ref to Employee; match by name
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
          // No employee found with that name — return empty result with pagination
          return res.status(200).json({
            success: true,
            customers: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalCustomers: 0,
              limit,
              hasNextPage: false,
              hasPrevPage: false,
            },
          });
        }
      } catch (empError) {
        console.error("Error finding employee for createdBy filter:", empError);
      }
    }

    // Build final query from conditions
    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    // ✅ Always get total count FIRST
    const totalCustomers = await Customer.countDocuments(query);
    const totalPages = Math.ceil(totalCustomers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const customers = await Customer.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Return success with empty array instead of 404 when filtered results are 0
    if (customers.length === 0) {
      return res.status(200).json({
        success: true,
        customers: [],
        pagination: {
          currentPage: page,
          totalPages,
          totalCustomers,
          limit,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    res.status(200).json({
      success: true,
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching customers: " + error.message,
    });
  }
};
exports.createCustomer = async (req, res) => {
  try {
    console.log('=== CREATE CUSTOMER START ===');
    const user = req.user;

    const {
      custName,
      billingAddress,
      email,
      GSTNo,
      customerContactPersonName1,
      phoneNumber1,
      customerContactPersonName2,
      phoneNumber2,
      zone,
      ownedBy,
      industryType,
      industryTypeOther,
      customerPriority,
    } = req.body;

    const existingCustomer = await Customer.findOne({
      company: user.company ? user.company : user._id,
      email: email,
    });

    if (existingCustomer) {
      return res.status(409).json({ success: false, error: "Customer already exist please use different email Id" });
    }

    if (industryType === 'Other' && (!industryTypeOther || industryTypeOther.trim() === '')) {
      return res.status(400).json({ success: false, error: "Please specify the industry type when selecting 'Other'" });
    }

    if (!customerPriority || !['P1', 'P2', 'P3'].includes(customerPriority)) {
      return res.status(400).json({ success: false, error: "Customer priority must be P1, P2, or P3" });
    }

    const newCust = new Customer({
      custName,
      GSTNo,
      company: user.company ? user.company : user._id,
      email: email.toLowerCase().trim(),
      createdBy: user._id,
      ownedBy: ownedBy || user.name,
      customerContactPersonName1,
      phoneNumber1,
      customerContactPersonName2,
      phoneNumber2,
      billingAddress,
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

    res.status(201).json({ success: true, message: "Customer created successfully", customer: savedCustomer });
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

    const projects = await Project.find({ custId: customerId });
    if (projects.length > 0) {
      return res.status(400).json({ success: false, error: "Customer cannot be deleted as they have associated projects." });
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
      return res.status(400).json({ success: false, error: "Please specify the industry type when selecting 'Other'" });
    }

    if (updatedData.customerPriority && !['P1', 'P2', 'P3'].includes(updatedData.customerPriority)) {
      return res.status(400).json({ success: false, error: "Customer priority must be P1, P2, or P3" });
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
        pincode: existingCustomer.billingAddress.pincode
      } : {},
      zone: existingCustomer.zone,
      ownedBy: existingCustomer.ownedBy,
      industryType: existingCustomer.industryType,
      industryTypeOther: existingCustomer.industryTypeOther,
      customerPriority: existingCustomer.customerPriority,
      _id: existingCustomer._id
    };

    let changes = [];
    const trackChanges = (fieldName, oldValue, newValue) => {
      // ✅ FIX: Normalize undefined/null to "" so CustomerHistory validation never fails
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
    trackChanges("customerContactPersonName2", existingCustomer.customerContactPersonName2, updatedData.customerContactPersonName2);
    trackChanges("phoneNumber2", existingCustomer.phoneNumber2, updatedData.phoneNumber2);
    trackChanges("zone", existingCustomer.zone, updatedData.zone);
    trackChanges("industryType", existingCustomer.industryType, updatedData.industryType);
    trackChanges("industryTypeOther", existingCustomer.industryTypeOther, updatedData.industryTypeOther);
    trackChanges("customerPriority", existingCustomer.customerPriority, updatedData.customerPriority);

    if (updatedData.billingAddress) {
      trackChanges("billingAddress.add", existingCustomer.billingAddress?.add, updatedData.billingAddress.add);
      trackChanges("billingAddress.city", existingCustomer.billingAddress?.city, updatedData.billingAddress.city);
      trackChanges("billingAddress.state", existingCustomer.billingAddress?.state, updatedData.billingAddress.state);
      trackChanges("billingAddress.country", existingCustomer.billingAddress?.country, updatedData.billingAddress.country);
      trackChanges("billingAddress.pincode", existingCustomer.billingAddress?.pincode, updatedData.billingAddress.pincode);
    }

    if (updatedData.deliveryAddress) {
      trackChanges("deliveryAddress.add", existingCustomer.deliveryAddress?.add, updatedData.deliveryAddress.add);
      trackChanges("deliveryAddress.city", existingCustomer.deliveryAddress?.city, updatedData.deliveryAddress.city);
      trackChanges("deliveryAddress.state", existingCustomer.deliveryAddress?.state, updatedData.deliveryAddress.state);
      trackChanges("deliveryAddress.country", existingCustomer.deliveryAddress?.country, updatedData.deliveryAddress.country);
      trackChanges("deliveryAddress.pincode", existingCustomer.deliveryAddress?.pincode, updatedData.deliveryAddress.pincode);
    }

    const updatedCustomerDoc = await Customer.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    }).populate("createdBy", "name email");

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
        pincode: updatedCustomerDoc.billingAddress.pincode
      } : {},
      zone: updatedCustomerDoc.zone,
      ownedBy: updatedCustomerDoc.ownedBy,
      industryType: updatedCustomerDoc.industryType,
      industryTypeOther: updatedCustomerDoc.industryTypeOther,
      customerPriority: updatedCustomerDoc.customerPriority,
      _id: updatedCustomerDoc._id
    };

    if (changes.length > 0) {
      await CustomerHistory.insertMany(changes);
    }

    await logUpdate(oldCustomerData, updatedCustomer, user, req, 'Customer');

    res.status(200).json({ success: true, message: "Customer updated successfully", updatedCustomer: updatedCustomerDoc });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating customer: " + error.message });
  }
};

// PDF Export Function
exports.exportCustomersPDF = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonName2 createdAt createdBy ownedBy industryType industryTypeOther customerPriority')
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      info: { Title: 'Customer Master Export', Author: 'ProClient360', Subject: 'Customer Data Export', CreationDate: new Date() }
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
    const headers = ['Sr No','Name','Email','Phone 1','Phone 2','Contact Person 1','Contact Person 2','GST No','Zone','Industry Type','Priority','Address','City','State','Pincode','Created By','Owned By'];
    const columnWidth = [30,60,70,50,50,60,60,50,35,60,40,70,45,45,40,50,50];
    const rowHeight = 25;

    const drawHeaders = (yPosition) => {
      let currentX = 30;
      doc.rect(30, yPosition, 770, rowHeight).fill('#3498db');
      doc.fillColor('#ffffff');
      doc.fontSize(8);
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
      if (alternateRow) doc.rect(30, yPosition, 770, rowHeight).fill('#f8f9fa');
      alternateRow = !alternateRow;

      let currentX = 30;
      doc.fontSize(7).fillColor('#2c3e50');
      const industryDisplay = customer.industryType === 'Other' ? (customer.industryTypeOther || 'Other') : (customer.industryType || '');
      const rowData = [
        index + 1, customer.custName || '', customer.email || '', customer.phoneNumber1 || '',
        customer.phoneNumber2 || '', customer.customerContactPersonName1 || '', customer.customerContactPersonName2 || '',
        customer.GSTNo || '', customer.zone || '', industryDisplay, customer.customerPriority || 'P2',
        customer.billingAddress?.add || '', customer.billingAddress?.city || '',
        customer.billingAddress?.state || '', customer.billingAddress?.pincode || '',
        customer.createdBy?.name || '', customer.ownedBy || ''
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
      doc.fontSize(8).fillColor('#95a5a6').text(`Page ${i + 1} of ${range.count}`, 30, doc.page.height - 30, { align: 'center' });
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Error generating PDF: " + error.message });
  }
};

// Excel Export Function
exports.exportCustomersExcel = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };

    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonName2 createdAt createdBy ownedBy industryType industryTypeOther customerPriority')
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Customers');

    worksheet.columns = [
      { header: 'Sr No', key: 'srNo', width: 10 },
      { header: 'Customer Name', key: 'custName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone 1', key: 'phoneNumber1', width: 15 },
      { header: 'Phone 2', key: 'phoneNumber2', width: 15 },
      { header: 'Contact Person 1', key: 'customerContactPersonName1', width: 20 },
      { header: 'Contact Person 2', key: 'customerContactPersonName2', width: 20 },
      { header: 'GST No', key: 'GSTNo', width: 15 },
      { header: 'Zone', key: 'zone', width: 10 },
      { header: 'Industry Type', key: 'industryType', width: 25 },
      { header: 'Priority', key: 'customerPriority', width: 10 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Pincode', key: 'pincode', width: 10 },
      { header: 'Created By', key: 'createdByName', width: 15 },
      { header: 'Created By Email', key: 'createdByEmail', width: 25 },
      { header: 'Owned By', key: 'ownedByName', width: 15 },
      { header: 'Created Date', key: 'createdAt', width: 15 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3498db' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    customers.forEach((customer, index) => {
      const industryDisplay = customer.industryType === 'Other' ? (customer.industryTypeOther || 'Other') : (customer.industryType || '');
      const row = worksheet.addRow({
        srNo: index + 1,
        custName: customer.custName || '',
        email: customer.email || '',
        phoneNumber1: customer.phoneNumber1 || '',
        phoneNumber2: customer.phoneNumber2 || '',
        customerContactPersonName1: customer.customerContactPersonName1 || '',
        customerContactPersonName2: customer.customerContactPersonName2 || '',
        GSTNo: customer.GSTNo || '',
        zone: customer.zone || '',
        industryType: industryDisplay,
        customerPriority: customer.customerPriority || 'P2',
        address: customer.billingAddress?.add || '',
        city: customer.billingAddress?.city || '',
        state: customer.billingAddress?.state || '',
        country: customer.billingAddress?.country || '',
        pincode: customer.billingAddress?.pincode || '',
        createdByName: customer.createdBy?.name || '',
        createdByEmail: customer.createdBy?.email || '',
        ownedByName: customer.ownedBy || '',
        createdAt: customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : ''
      });

      row.height = 20;
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });

      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f8f9fa' } };
        });
      }
    });

    const summaryRow = worksheet.addRow({ srNo: '', custName: 'Total Customers:', email: customers.length });
    summaryRow.height = 25;
    summaryRow.eachCell((cell, colNumber) => {
      if (colNumber === 2 || colNumber === 3) {
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