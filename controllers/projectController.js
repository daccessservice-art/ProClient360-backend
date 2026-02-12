const { ObjectId } = require("mongodb");
const PDFDocument = require("pdfkit");

const Project = require("../models/projectModel");
const Designation = require("../models/designationModel");
const Tasksheet = require("../models/taskSheetModel");
const ProjectHistory = require("../models/projectHistoryModel");
const TaskSheet = require("../models/taskSheetModel");
const Customer = require("../models/customerModel");
const {bucket} = require('../utils/firebase');
const { logCreation, logUpdate, logDeletion } = require('../helpers/activityLogHelper');

exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, search } = req.query;

    const isCompany = user.company ? false : true;
    let query = { company: isCompany ? user._id : user.company,};

    if( !isCompany ) {
      const designation = await Designation.findOne({ _id: user.designation });
      if (!designation) {
        return res.status(404).json({ success: false, error: "Designation not found" });
      }
      if (designation.permissions && !designation.permissions.includes("viewProject")) {
        query.createdBy = user._id;
      }
    }

    const validStatuses = ["Upcoming", "Inprocess", "Completed"];

    if (status && validStatuses.includes(status)) {
      query.projectStatus = status;
    }
    
    if (search && search.trim() !== "") {
      const customers = await Customer.find({
        custName: { $regex: search, $options: "i" }
      }).select('_id');
      
      const customerIds = customers.map(customer => customer._id);
      
      if (customerIds.length > 0) {
        query.custId = { $in: customerIds };
      } else {
        return res.status(200).json({
          success: true,
          projects: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalRecords: 0,
            limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
      }
    }
    
    const projects = await Project.find(query)
      .skip(skip)
      .limit(limit)
      .populate("custId", "custName")
      .populate({ path: 'createdBy', model: 'Employee', select: 'name' })
      .sort({ createdAt: -1 })
      .lean();

    if (projects.length <= 0) {
      return res.status(200).json({
        success: true,
        projects: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalRecords: 0,
          limit,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    const totalRecords = await Project.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      projects,
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
    console.log("Error in showAll Controller:", error);
    res
      .status(500)
      .json({ error: "Error while fetching projects: " + error.message });
  }
};

exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }
    res.status(200).json({ success: true, message: "Project fetched successfully", project });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error in getProject Controller : " + error.message });
  }
};

exports.myProjects = async (req, res) => {
  try {
    const user=req.user;

    const uniqueProjectIds = await TaskSheet.distinct("project", {
      company: user.company,
      employees: user._id,
    });

    const projects = await Project.find({
      _id: { $in: uniqueProjectIds },
    }).populate("custId", "custName");

    res.status(200).json({ success: true, message: "My projects fetched successfully", projects });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error In My project controller: " + error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const user=req.user;
    const query = req.query.search;

    const projects = await Project.find({
      company: user.company ? user.company : user._id,
      name: { $regex: query, $options: "i" },
    });

    if (projects.length <= 0) {
      return res.status(400).json({ success: false, error: "No Projects Found" });
    }

    res.status(200).json({ success: true, message: "Projects fetched successfully", projects });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error while searching projects: " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    let {
      name,
      custId,
      completeLevel,
      purchaseOrderNo,
      purchaseOrderDate,
      purchaseOrderValue,
      category,
      startDate,
      endDate,
      advancePay,
      payAgainstDelivery,
      payAfterCompletion,
      remark,
      POCopy,
      Address,
      retention
    } = req.body;

    const user = req.user;
    
    if(!user.company){
      return res.status(403).json({ success: false, error: "Access denied. Companies cannot create projects." });
    }

    completeLevel = completeLevel === undefined ? 0 : completeLevel;

    let address = Address;
    
    if(!address){
      console.log("Address is required:", req.body);
      return res.status(400).json({success:false,error:"Address Required..."});
    }

    let POCopyUrl = null;
    if (POCopy) {
      try {
        let base64String;
        
        if (Array.isArray(POCopy) && POCopy.length > 0) {
          base64String = POCopy[0];
        } else if (typeof POCopy === 'string') {
          base64String = POCopy;
        }
        
        if (base64String && base64String.includes(',')) {
          base64String = base64String.split(',')[1];
        }
        
        if (base64String && base64String.trim().length > 0) {
          const buffer = Buffer.from(base64String, 'base64'); 
          const fileName = `POCopy/${name}_${Date.now()}.pdf`; 
          const file = bucket.file(fileName);

          await file.save(buffer, {
            metadata: { contentType: 'application/pdf' }, 
          });

          await file.makePublic();
          POCopyUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        }
      } catch (error) {
        console.error('Error processing POCopy:', error);
        return res.status(400).json({
          success: false,
          error: "Invalid file format for POCopy"
        });
      }
    }
   
    const newProject = new Project({
      custId,
      name,
      purchaseOrderNo,
      purchaseOrderDate: new Date(purchaseOrderDate),
      purchaseOrderValue,
      category,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      advancePay,
      payAgainstDelivery,
      payAfterCompletion,
      remark,
      completeLevel: completeLevel,
      POCopy: POCopyUrl,
      Address: address,
      createdBy: user._id,
      retention,
      projectStatus:
        new Date(startDate) > new Date()
          ? "Upcoming"
          : completeLevel < 100
          ? "Inprocess"
          : "Completed",
      company: user.company ? user.company : user._id,
      createdAt: new Date()
    });

    const savedProject = await newProject.save();

    // *** LOG ACTIVITY - Project Creation ***
    await logCreation(savedProject, user, req, 'Project');

    res.status(201).json({
      success: true,
      message: "Project Created Successfully",
      project: savedProject
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error while creating Project: " + error.message });
  }
};

exports.exportProjects = async (req, res) => {
  try {
    const user=req.user;
    
    const { startDate, endDate, status } = req.params;

    const query = {
      company: user.company ? user.company : user._id,
      ...(status && { projectStatus: status }), 
    };

    if (startDate) {
      query.startDate = { $gte: new Date(startDate) }; 
    }

    if (endDate) {
      query.endDate = { $lte: new Date(endDate) }; 
    } else {
      query.endDate = { $lte: new Date() }; 
    }

    const projects = await Project.find(query).populate("custId", "custName");

    const doc = new PDFDocument();
    const tableWidth = 500;
    const columnCount = 9; 
    const columnWidth = tableWidth / columnCount;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=projects_report.pdf"
    );

    doc.pipe(res);

    doc.fontSize(16).text("Projects Report", { align: "center" });
    doc.moveDown();

    const tableHeaders = [
      "S.No",
      "Project Name",
      "Customer",
      "PO Date",
      "PO Value",
      "Category",
      "Start Date",
      "End Date",
      "Project Status",
    ];

    let y = doc.y; 
    doc.fontSize(12).font("Helvetica-Bold");
    tableHeaders.forEach((header, index) => {
      doc.rect(50 + index * columnWidth, y, columnWidth, 30).stroke();
      doc.text(header, 50 + index * columnWidth + 5, y + 5, {
        width: columnWidth - 10,
        align: "center",
      }); 
    });
    y += 30; 

    doc
      .moveTo(50, y)
      .lineTo(50 + tableWidth, y)
      .stroke();
    y += 5; 

    doc.fontSize(10).font("Helvetica"); 
    projects.forEach((project, index) => {
      const rowData = [
        index + 1,
        project.name,
        project.custId ? project.custId.custName : "N/A",
        project.purchaseOrderDate
          ? project.purchaseOrderDate.toDateString()
          : "N/A",
        project.purchaseOrderValue.toString(),
        project.category,
        project.startDate ? project.startDate.toDateString() : "N/A",
        project.endDate ? project.endDate.toDateString() : "N/A",
        project.projectStatus || "N/A",
      ];

      const rowHeight = 30;
      let maxRowHeight = rowHeight; 

      rowData.forEach((data, index) => {
        const textHeight = doc.heightOfString(data, {
          width: columnWidth - 10,
        });
        const cellHeight = Math.ceil(textHeight / 10) * 10; 
        if (cellHeight > maxRowHeight) {
          maxRowHeight = cellHeight; 
        }
      });

      rowData.forEach((data, index) => {
        doc
          .rect(50 + index * columnWidth, y, columnWidth, maxRowHeight)
          .stroke(); 
        doc.text(data, 50 + index * columnWidth + 5, y + 5, {
          width: columnWidth - 10,
          align: "center",
          height: maxRowHeight,
        }); 
      });

      y += maxRowHeight; 
    });

    doc.rect(50, 60, tableWidth, y - 60).stroke(); 

    doc.end();
  } catch (error) {
    console.error("Export error:", error);
    res
      .status(500)
      .json({ error: "Under construction,  Error exporting projects: " + error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const projectId = req.params.id;
    const user = req.user;

    const project = await Project.findById(projectId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, error: "Project not found" });
    }

    // *** LOG ACTIVITY - Project Deletion ***
    await logDeletion(project, user, req, 'Project');

    await Tasksheet.deleteMany({ project: projectId });
    await Project.findByIdAndDelete(projectId);

    res
      .status(200)
      .json({ success: true, message: "Project and its tasks deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Error while deleting project: " + error.message });
  }
};

exports.updateProject = async (req, res) => {
  const { id } = req.params; 
  const user = req.user;
  const {
    name,
    custId,
    Address,
    completeLevel,
    purchaseOrderNo,
    projectStatus,
    purchaseOrderDate,
    purchaseOrderValue,
    category,
    startDate,
    endDate,
    advancePay,
    payAgainstDelivery,
    payAfterCompletion,
    remark,
    POCopy,
    retention,
    completionCertificate,
    warrantyCertificate,
    warrantyStartDate,
    warrantyMonths
  } = req.body;
  
  try {
    const originalData = await Project.findById(id);
    
    if (!originalData) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Helper function to serialize Address object for comparison
    const serializeAddress = (addr) => {
      if (!addr) return null;
      return JSON.stringify({
        add: addr.add || null,
        city: addr.city || null,
        state: addr.state || null,
        country: addr.country || null,
        pincode: addr.pincode || null
      });
    };

    // *** STORE OLD DATA FOR LOGGING - Convert to plain object ***
    const oldProjectData = {
      name: originalData.name,
      custId: originalData.custId ? originalData.custId.toString() : null,
      Address: serializeAddress(originalData.Address),
      completeLevel: originalData.completeLevel,
      purchaseOrderNo: originalData.purchaseOrderNo,
      projectStatus: originalData.projectStatus,
      purchaseOrderDate: originalData.purchaseOrderDate,
      purchaseOrderValue: originalData.purchaseOrderValue,
      category: originalData.category,
      startDate: originalData.startDate,
      endDate: originalData.endDate,
      advancePay: originalData.advancePay,
      payAgainstDelivery: originalData.payAgainstDelivery,
      payAfterCompletion: originalData.payAfterCompletion,
      remark: originalData.remark,
      retention: originalData.retention,
      POCopy: originalData.POCopy,
      completionCertificate: originalData.completionCertificate,
      warrantyCertificate: originalData.warrantyCertificate,
      warrantyStartDate: originalData.warrantyStartDate,
      warrantyMonths: originalData.warrantyMonths,
      _id: originalData._id
    };
    
    // *** BUILD UPDATE DATA - Include only fields that are provided ***
    const updateData = {};
    
    // Only add fields to updateData if they are provided in the request
    if (name !== undefined) updateData.name = name;
    if (custId !== undefined) updateData.custId = custId;
    if (Address !== undefined) updateData.Address = Address;
    if (completeLevel !== undefined) updateData.completeLevel = completeLevel;
    if (purchaseOrderNo !== undefined) updateData.purchaseOrderNo = purchaseOrderNo;
    if (projectStatus !== undefined) updateData.projectStatus = projectStatus;
    if (purchaseOrderValue !== undefined) updateData.purchaseOrderValue = purchaseOrderValue;
    if (category !== undefined) updateData.category = category;
    if (advancePay !== undefined) updateData.advancePay = advancePay;
    if (payAgainstDelivery !== undefined) updateData.payAgainstDelivery = payAgainstDelivery;
    if (payAfterCompletion !== undefined) updateData.payAfterCompletion = payAfterCompletion;
    if (remark !== undefined) updateData.remark = remark;
    if (retention !== undefined) updateData.retention = retention;
    
    // Handle date fields with validation
    if (purchaseOrderDate !== undefined && purchaseOrderDate !== null && purchaseOrderDate !== '') {
      const poDate = new Date(purchaseOrderDate);
      if (!isNaN(poDate.getTime())) {
        updateData.purchaseOrderDate = poDate;
      }
    }
    
    if (startDate !== undefined && startDate !== null && startDate !== '') {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        updateData.startDate = start;
      }
    }
    
    if (endDate !== undefined && endDate !== null && endDate !== '') {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        updateData.endDate = end;
      }
    }
    
    // Handle POCopy upload
    if (POCopy) {
      try {
        let base64String = POCopy;
        if (base64String.includes(',')) {
          base64String = base64String.split(',')[1];
        }
        const buffer = Buffer.from(base64String, 'base64');
        const fileName = `POCopy/${id}_${Date.now()}.pdf`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
          metadata: { contentType: 'application/pdf' },
        });

        await file.makePublic();
        const POCopyUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        updateData.POCopy = POCopyUrl;
      } catch (error) {
        console.error('Error processing POCopy:', error);
        return res.status(400).json({
          success: false,
          error: "Invalid file format for POCopy"
        });
      }
    }

    // Handle completion certificate upload
    if (completionCertificate) {
      try {
        let base64String = completionCertificate;
        if (base64String.includes(',')) {
          base64String = base64String.split(',')[1];
        }
        const buffer = Buffer.from(base64String, 'base64');
        const fileName = `completionCertificate/${id}_${Date.now()}.pdf`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
          metadata: { contentType: 'application/pdf' },
        });

        await file.makePublic();
        const completionCertificateUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        updateData.completionCertificate = completionCertificateUrl;
      } catch (error) {
        console.error('Error processing completionCertificate:', error);
        return res.status(400).json({
          success: false,
          error: "Invalid file format for completionCertificate"
        });
      }
    }

    // Handle warranty certificate upload
    if (warrantyCertificate) {
      try {
        let base64String = warrantyCertificate;
        if (base64String.includes(',')) {
          base64String = base64String.split(',')[1];
        }
        const buffer = Buffer.from(base64String, 'base64');
        const fileName = `warrantyCertificate/${id}_${Date.now()}.pdf`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
          metadata: { contentType: 'application/pdf' },
        });

        await file.makePublic();
        const warrantyCertificateUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        updateData.warrantyCertificate = warrantyCertificateUrl;
      } catch (error) {
        console.error('Error processing warrantyCertificate:', error);
        return res.status(400).json({
          success: false,
          error: "Invalid file format for warrantyCertificate"
        });
      }
    }

    // Handle warranty start date with validation
    if (warrantyStartDate !== undefined && warrantyStartDate !== null && warrantyStartDate !== '') {
      const warrantyDate = new Date(warrantyStartDate);
      if (!isNaN(warrantyDate.getTime())) {
        updateData.warrantyStartDate = warrantyDate;
      }
    }
    
    // Handle warranty months with validation
    if (warrantyMonths !== undefined && warrantyMonths !== null && warrantyMonths !== '') {
      const months = parseInt(warrantyMonths);
      if (!isNaN(months)) {
        updateData.warrantyMonths = months;
      }
    }

    const updatedProjectDoc = await Project.findByIdAndUpdate(
      id, 
      { $set: updateData }, 
      { runValidators: true, new: true }
    );

    if (!updatedProjectDoc) {
      return res.status(404).json({ success: false, error: "Project not found after update" });
    }

    // *** CONVERT TO PLAIN OBJECT FOR LOGGING ***
    const updatedProject = {
      name: updatedProjectDoc.name,
      custId: updatedProjectDoc.custId ? updatedProjectDoc.custId.toString() : null,
      Address: serializeAddress(updatedProjectDoc.Address),
      completeLevel: updatedProjectDoc.completeLevel,
      purchaseOrderNo: updatedProjectDoc.purchaseOrderNo,
      projectStatus: updatedProjectDoc.projectStatus,
      purchaseOrderDate: updatedProjectDoc.purchaseOrderDate,
      purchaseOrderValue: updatedProjectDoc.purchaseOrderValue,
      category: updatedProjectDoc.category,
      startDate: updatedProjectDoc.startDate,
      endDate: updatedProjectDoc.endDate,
      advancePay: updatedProjectDoc.advancePay,
      payAgainstDelivery: updatedProjectDoc.payAgainstDelivery,
      payAfterCompletion: updatedProjectDoc.payAfterCompletion,
      remark: updatedProjectDoc.remark,
      retention: updatedProjectDoc.retention,
      POCopy: updatedProjectDoc.POCopy,
      completionCertificate: updatedProjectDoc.completionCertificate,
      warrantyCertificate: updatedProjectDoc.warrantyCertificate,
      warrantyStartDate: updatedProjectDoc.warrantyStartDate,
      warrantyMonths: updatedProjectDoc.warrantyMonths,
      _id: updatedProjectDoc._id
    };

    // *** DEBUGGING - Log the data being compared ***
    console.log('=== DEBUGGING ACTIVITY LOG ===');
    console.log('Old custId:', oldProjectData.custId);
    console.log('New custId:', updatedProject.custId);
    console.log('Old category:', oldProjectData.category);
    console.log('New category:', updatedProject.category);
    console.log('Old purchaseOrderValue:', oldProjectData.purchaseOrderValue);
    console.log('New purchaseOrderValue:', updatedProject.purchaseOrderValue);
    console.log('Old advancePay:', oldProjectData.advancePay);
    console.log('New advancePay:', updatedProject.advancePay);
    console.log('Old retention:', oldProjectData.retention);
    console.log('New retention:', updatedProject.retention);
    console.log('Old Address:', oldProjectData.Address);
    console.log('New Address:', updatedProject.Address);
    console.log('================================');

    // *** LOG ACTIVITY - Project Update ***
    await logUpdate(oldProjectData, updatedProject, user, req, 'Project');

    return res.status(200).json({ success: true, message: "Project Updated Successfully" });
  } catch (error) {
    console.error("Error updating project:", error);
    return res
      .status(500)
      .json({ error: "Error While Updating Project: " + error.message });
  }
};