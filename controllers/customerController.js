const Customer = require("../models/customerModel");
const jwt = require("jsonwebtoken");
const CustomerHistory = require("../models/customerHistoryModel");
const Project = require("../models/projectModel");
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate("createdBy", "name email");
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer fetched successfully", customer });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error in getting a customer: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    // Extract pagination query parameters
    let page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 records per page
    let skip = (page - 1) * limit; // Calculate documents to skip

    const { q } = req.query;

    let query = {};
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
      query = {
        company: user.company ? user.company : user._id,
        $or: [
          { custName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
          { phoneNumber1: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    // Fetch paginated customers with populated fields
    const customers = await Customer.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email") // Populate createdBy
      .sort({ createdAt: -1 })
      .lean(); // Optimize performance

    // Check if customers exist
    if (customers.length === 0) {
      return res.status(404).json({ success: false, error: "No customers found" });
    }

    // Get total number of customers for the query
    const totalCustomers = await Customer.countDocuments(query);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCustomers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Send response with customers and pagination metadata
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
      ownedBy, // Add this new field
    } = req.body;

    const customer = await Customer.find({
      company: user.company ? user.company : user._id,
      email: email,
    });
    if (customer.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: "Customer already exist please use different email Id" });
    }

    const newCust = Customer({
      custName,
      GSTNo,
      company: user.company ? user.company : user._id,
      email: email.toLowerCase().trim(),
      createdBy: user._id, // Set createdBy to current user
      ownedBy: ownedBy || user.name, // Set ownedBy to provided name or current user's name if not specified
      customerContactPersonName1,
      phoneNumber1,
      customerContactPersonName2,
      phoneNumber2,
      billingAddress,
      zone,
    });

    if (newCust) {
      await newCust.save();
      res.status(201).json({
        success: true,
        message: "Customer created successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Invalid customer data"
      });
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({
        success: false,
        error: error.message
      });
    } else {
      res
        .status(500)
        .json({ error: "Error creating customer: " + error.message });
    }
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    // Check if there are any projects associated with the customer
    const projects = await Project.find({ custId: customerId });

    if (projects.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Customer cannot be deleted as they have associated projects."
      });
    }

    // Proceed to delete the customer if no projects are found
    const customer = await Customer.findByIdAndDelete(customerId);

    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer Not Found!!" });
    }

    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting customer: " + error.message
    });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Find the existing customer
    const existingCustomer = await Customer.findById(id);

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    // Prepare an array to store changes
    let changes = [];

    // Helper function to track changes
    const trackChanges = (fieldName, oldValue, newValue) => {
      if (oldValue !== newValue) {
        changes.push({
          customerId: id,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          changeReason: req.body.changeReason || "Updated via customer edit",
        });
      }
    };

    // Compare fields and track changes
    trackChanges("custName", existingCustomer.custName, updatedData.custName);
    trackChanges("email", existingCustomer.email, updatedData.email);
    trackChanges("GSTNo", existingCustomer.GSTNo, updatedData.GSTNo);
    trackChanges("ownedBy", existingCustomer.ownedBy, updatedData.ownedBy);
    trackChanges(
      "customerContactPersonName1",
      existingCustomer.customerContactPersonName1,
      updatedData.customerContactPersonName1
    );
    trackChanges(
      "phoneNumber1",
      existingCustomer.phoneNumber1,
      updatedData.phoneNumber1
    );
    trackChanges(
      "customerContactPersonName2",
      existingCustomer.customerContactPersonName2,
      updatedData.customerContactPersonName2
    );
    trackChanges(
      "phoneNumber2",
      existingCustomer.phoneNumber2,
      updatedData.phoneNumber2
    );

    // Compare nested objects like billingAddress and deliveryAddress
    if (updatedData.billingAddress) {
      trackChanges(
        "billingAddress.add",
        existingCustomer.billingAddress?.add,
        updatedData.billingAddress.add
      );
      trackChanges(
        "billingAddress.city",
        existingCustomer.billingAddress?.city,
        updatedData.billingAddress.city
      );
      trackChanges(
        "billingAddress.state",
        existingCustomer.billingAddress?.state,
        updatedData.billingAddress.state
      );
      trackChanges(
        "billingAddress.country",
        existingCustomer.billingAddress?.country,
        updatedData.billingAddress.country
      );
      trackChanges(
        "billingAddress.pincode",
        existingCustomer.billingAddress?.pincode,
        updatedData.billingAddress.pincode
      );
    }

    if (updatedData.deliveryAddress) {
      trackChanges(
        "deliveryAddress.add",
        existingCustomer.deliveryAddress?.add,
        updatedData.deliveryAddress.add
      );
      trackChanges(
        "deliveryAddress.city",
        existingCustomer.deliveryAddress?.city,
        updatedData.deliveryAddress.city
      );
      trackChanges(
        "deliveryAddress.state",
        existingCustomer.deliveryAddress?.state,
        updatedData.deliveryAddress.state
      );
      trackChanges(
        "deliveryAddress.country",
        existingCustomer.deliveryAddress?.country,
        updatedData.deliveryAddress.country
      );
      trackChanges(
        "deliveryAddress.pincode",
        existingCustomer.deliveryAddress?.pincode,
        updatedData.deliveryAddress.pincode
      );
    }

    // Save the updated customer record
    const updatedCustomer = await Customer.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    }).populate("createdBy", "name email");

    // Save the changes to the customerHistory collection if there are any
    if (changes.length > 0) {
      await CustomerHistory.insertMany(changes);
    }

    res.status(200).json({ success: true, message: "Customer updated successfully", updatedCustomer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating customer: " + error.message });
  }
};

// PDF Export Function (Improved with all fields)
exports.exportCustomersPDF = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };
    
    // Get all customers for export with populated fields
    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonName2 createdAt createdBy ownedBy')
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    // Create PDF document with landscape orientation for better width
    const doc = new PDFDocument({ 
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      info: {
        Title: 'Customer Master Export',
        Author: 'ProClient360',
        Subject: 'Customer Data Export',
        CreationDate: new Date()
      }
    });
    
    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Set response headers - Updated for production compatibility
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Handle errors during PDF generation
    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: "Error generating PDF: " + err.message 
        });
      }
    });
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add header
    doc.fontSize(20).fillColor('#2c3e50').text('Customer Master Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#7f8c8d').text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#2c3e50').text(`Total Customers: ${customers.length}`);
    doc.moveDown();
    
    // Table configuration with more columns
    const tableTop = doc.y;
    const headers = [
      'Sr No', 
      'Name', 
      'Email', 
      'Phone 1', 
      'Phone 2', 
      'Contact Person 1', 
      'Contact Person 2', 
      'GST No', 
      'Zone', 
      'Address', 
      'City', 
      'State', 
      'Country', 
      'Pincode',
      'Created By',
      'Owned By'
    ];
    
    // Adjust column widths for landscape orientation
    const columnWidth = [
      30,  // Sr No
      70,  // Name
      80,  // Email
      50,  // Phone 1
      50,  // Phone 2
      70,  // Contact Person 1
      70,  // Contact Person 2
      50,  // GST No
      40,  // Zone
      80,  // Address
      50,  // City
      50,  // State
      50,  // Country
      40,  // Pincode
      60,  // Created By
      60   // Owned By
    ];
    
    const rowHeight = 25;
    
    // Function to draw table headers
    const drawHeaders = (yPosition) => {
      let currentX = 30;
      doc.fontSize(8).fillColor('#ffffff');
      
      // Header background
      doc.rect(30, yPosition, 750, rowHeight).fill('#3498db');
      
      // Header text
      doc.fillColor('#ffffff');
      headers.forEach((header, i) => {
        doc.text(header, currentX + 2, yPosition + 8, { width: columnWidth[i] - 4 });
        currentX += columnWidth[i];
      });
      
      return yPosition + rowHeight;
    };
    
    // Draw initial headers
    let yPosition = drawHeaders(tableTop);
    let alternateRow = false;
    
    // Function to draw customer row
    const drawCustomerRow = (customer, index, yPosition) => {
      // Check if we need a new page (adjusted for landscape)
      if (yPosition > 500) {
        doc.addPage();
        yPosition = 50;
        yPosition = drawHeaders(yPosition);
      }
      
      // Alternate row colors
      if (alternateRow) {
        doc.rect(30, yPosition, 750, rowHeight).fill('#f8f9fa');
      }
      alternateRow = !alternateRow;
      
      // Add row data
      let currentX = 30;
      doc.fontSize(7).fillColor('#2c3e50');
      
      const rowData = [
        index + 1,
        customer.custName || '',
        customer.email || '',
        customer.phoneNumber1 || '',
        customer.phoneNumber2 || '',
        customer.customerContactPersonName1 || '',
        customer.customerContactPersonName2 || '',
        customer.GSTNo || '',
        customer.zone || '',
        customer.billingAddress?.add || '',
        customer.billingAddress?.city || '',
        customer.billingAddress?.state || '',
        customer.billingAddress?.country || '',
        customer.billingAddress?.pincode || '',
        customer.createdBy?.name || '',
        customer.ownedBy || ''
      ];
      
      rowData.forEach((text, i) => {
        doc.text(text, currentX + 2, yPosition + 8, { width: columnWidth[i] - 4 });
        currentX += columnWidth[i];
      });
      
      return yPosition + rowHeight;
    };
    
    // Draw all customer rows
    customers.forEach((customer, index) => {
      yPosition = drawCustomerRow(customer, index, yPosition);
    });
    
    // Add page numbers before finalizing the document
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#95a5a6').text(
        `Page ${i + 1} of ${range.count}`, 
        30, 
        doc.page.height - 30, 
        { align: 'center' }
      );
    }
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: "Error generating PDF: " + error.message 
      });
    }
  }
};

// Excel Export Function (Improved with all fields)
exports.exportCustomersExcel = async (req, res) => {
  try {
    const user = req.user;
    const query = { company: user.company || user._id };
    
    // Get all customers for export with populated fields
    const customers = await Customer.find(query)
      .select('custName email phoneNumber1 phoneNumber2 GSTNo zone billingAddress customerContactPersonName1 customerContactPersonName2 createdAt createdBy ownedBy')
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.lastModifiedBy = 'ProClient360';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Add worksheet
    const worksheet = workbook.addWorksheet('Customers');
    
    // Define columns with all fields
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
    
    // Add header row with styling
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '3498db' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Add data rows
    customers.forEach((customer, index) => {
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
      
      // Style data rows
      row.height = 20;
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      // Alternate row colors
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'f8f9fa' }
          };
        });
      }
    });
    
    // Add summary row at the end
    const summaryRow = worksheet.addRow({
      srNo: '',
      custName: 'Total Customers:',
      email: customers.length,
      phoneNumber1: '',
      phoneNumber2: '',
      customerContactPersonName1: '',
      customerContactPersonName2: '',
      GSTNo: '',
      zone: '',
      address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      createdByName: '',
      createdByEmail: '',
      ownedByName: '',
      createdAt: ''
    });
    
    summaryRow.height = 25;
    summaryRow.eachCell((cell, colNumber) => {
      if (colNumber === 2 || colNumber === 3) {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'e8f5e9' }
        };
      }
    });
    
    // Freeze header row
    worksheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];
    
    // Set response headers - Updated for production compatibility
    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Write the file to response and handle errors
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: "Error generating Excel: " + error.message 
      });
    }
  }
};