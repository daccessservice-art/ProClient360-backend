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
    let query = { company: isCompany ? user._id : user.company };

    if (!isCompany) {
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

    // Add taskCount per project
    const projectIds = projects.map(p => p._id);
    const taskCounts = await Tasksheet.aggregate([
      { $match: { project: { $in: projectIds } } },
      { $group: { _id: "$project", count: { $sum: 1 } } }
    ]);
    const taskCountMap = {};
    taskCounts.forEach(t => { taskCountMap[t._id.toString()] = t.count; });
    projects.forEach(p => { p.taskCount = taskCountMap[p._id.toString()] || 0; });

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
    res.status(500).json({ error: "Error while fetching projects: " + error.message });
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
    res.status(500).json({ error: "Error in getProject Controller : " + error.message });
  }
};

exports.myProjects = async (req, res) => {
  try {
    const user = req.user;

    const uniqueProjectIds = await TaskSheet.distinct("project", {
      company: user.company,
      employees: user._id,
    });

    const projects = await Project.find({
      _id: { $in: uniqueProjectIds },
    }).populate("custId", "custName");

    res.status(200).json({ success: true, message: "My projects fetched successfully", projects });
  } catch (error) {
    res.status(500).json({ error: "Error In My project controller: " + error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const user = req.user;
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
    res.status(500).json({ error: "Error while searching projects: " + error.message });
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

    if (!user.company) {
      return res.status(403).json({ success: false, error: "Access denied. Companies cannot create projects." });
    }

    completeLevel = completeLevel === undefined ? 0 : completeLevel;

    if (!Address) {
      return res.status(400).json({ success: false, error: "Address Required..." });
    }

    // ── POCopy Upload ──────────────────────────────────────────────────────────
    let POCopyUrl = null;
    if (POCopy) {
      try {
        if (typeof POCopy !== 'string') {
          return res.status(400).json({ success: false, error: "Invalid POCopy format: expected base64 string" });
        }

        let base64String = POCopy.trim();

        if (base64String.includes(',')) {
          base64String = base64String.split(',')[1];
        }

        if (!base64String || base64String.length < 100) {
          return res.status(400).json({ success: false, error: "POCopy file data is empty or corrupted" });
        }

        const buffer = Buffer.from(base64String, 'base64');

        if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== '%PDF') {
          return res.status(400).json({ success: false, error: "Uploaded file is not a valid PDF" });
        }

        if (buffer.length > 2 * 1024 * 1024) {
          return res.status(400).json({ success: false, error: "POCopy file must be less than 2MB" });
        }

        const safeName = (name || 'project').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const fileName = `POCopy/${safeName}_${Date.now()}.pdf`;
        const file = bucket.file(fileName);

        await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
        await file.makePublic();

        POCopyUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      } catch (error) {
        console.error('[create] POCopy error:', error.message);
        return res.status(400).json({ success: false, error: "Failed to process POCopy: " + error.message });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

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
      completeLevel,
      POCopy: POCopyUrl,
      Address,
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
    await logCreation(savedProject, user, req, 'Project');

    res.status(201).json({
      success: true,
      message: "Project Created Successfully",
      project: savedProject
    });
  } catch (error) {
    console.error('[create] Unhandled error:', error.message);
    res.status(500).json({ error: "Error while creating Project: " + error.message });
  }
};

exports.exportProjects = async (req, res) => {
  try {
    const user = req.user;

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
    res.setHeader("Content-Disposition", "attachment; filename=projects_report.pdf");

    doc.pipe(res);

    doc.fontSize(16).text("Projects Report", { align: "center" });
    doc.moveDown();

    const tableHeaders = [
      "S.No", "Project Name", "Customer", "PO Date",
      "PO Value", "Category", "Start Date", "End Date", "Project Status",
    ];

    let y = doc.y;
    doc.fontSize(12).font("Helvetica-Bold");
    tableHeaders.forEach((header, index) => {
      doc.rect(50 + index * columnWidth, y, columnWidth, 30).stroke();
      doc.text(header, 50 + index * columnWidth + 5, y + 5, { width: columnWidth - 10, align: "center" });
    });
    y += 30;

    doc.moveTo(50, y).lineTo(50 + tableWidth, y).stroke();
    y += 5;

    doc.fontSize(10).font("Helvetica");
    projects.forEach((project, index) => {
      const rowData = [
        index + 1,
        project.name,
        project.custId ? project.custId.custName : "N/A",
        project.purchaseOrderDate ? project.purchaseOrderDate.toDateString() : "N/A",
        project.purchaseOrderValue.toString(),
        project.category,
        project.startDate ? project.startDate.toDateString() : "N/A",
        project.endDate ? project.endDate.toDateString() : "N/A",
        project.projectStatus || "N/A",
      ];

      const rowHeight = 30;
      let maxRowHeight = rowHeight;

      rowData.forEach((data) => {
        const textHeight = doc.heightOfString(data, { width: columnWidth - 10 });
        const cellHeight = Math.ceil(textHeight / 10) * 10;
        if (cellHeight > maxRowHeight) maxRowHeight = cellHeight;
      });

      rowData.forEach((data, index) => {
        doc.rect(50 + index * columnWidth, y, columnWidth, maxRowHeight).stroke();
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
    res.status(500).json({ error: "Error exporting projects: " + error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const projectId = req.params.id;
    const user = req.user;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    await logDeletion(project, user, req, 'Project');
    await Tasksheet.deleteMany({ project: projectId });
    await Project.findByIdAndDelete(projectId);

    res.status(200).json({ success: true, message: "Project and its tasks deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while deleting project: " + error.message });
  }
};

exports.updateProject = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    name, custId, Address, completeLevel, purchaseOrderNo, projectStatus,
    purchaseOrderDate, purchaseOrderValue, category, startDate, endDate,
    advancePay, payAgainstDelivery, payAfterCompletion, remark, POCopy,
    retention, completionCertificate, warrantyCertificate, warrantyStartDate, warrantyMonths
  } = req.body;

  try {
    const originalData = await Project.findById(id);
    if (!originalData) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

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

    const updateData = {};
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

    if (purchaseOrderDate) {
      const poDate = new Date(purchaseOrderDate);
      if (!isNaN(poDate.getTime())) updateData.purchaseOrderDate = poDate;
    }
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) updateData.startDate = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) updateData.endDate = end;
    }

    // ── File uploads ───────────────────────────────────────────────────────────
    const uploadFile = async (base64Data, folder, label) => {
      if (!base64Data || typeof base64Data !== 'string') return null;
      let b64 = base64Data.trim();
      if (b64.includes(',')) b64 = b64.split(',')[1];
      if (!b64 || b64.length < 100) return null;
      const buffer = Buffer.from(b64, 'base64');
      const fileName = `${folder}/${id}_${Date.now()}.pdf`;
      const file = bucket.file(fileName);
      await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
      await file.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    };

    if (POCopy) {
      try {
        const url = await uploadFile(POCopy, 'POCopy', 'POCopy');
        if (url) updateData.POCopy = url;
      } catch (e) {
        return res.status(400).json({ success: false, error: "Invalid file format for POCopy" });
      }
    }

    if (completionCertificate) {
      try {
        const url = await uploadFile(completionCertificate, 'completionCertificate', 'completionCertificate');
        if (url) updateData.completionCertificate = url;
      } catch (e) {
        return res.status(400).json({ success: false, error: "Invalid file format for completionCertificate" });
      }
    }

    if (warrantyCertificate) {
      try {
        const url = await uploadFile(warrantyCertificate, 'warrantyCertificate', 'warrantyCertificate');
        if (url) updateData.warrantyCertificate = url;
      } catch (e) {
        return res.status(400).json({ success: false, error: "Invalid file format for warrantyCertificate" });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    if (warrantyStartDate) {
      const warrantyDate = new Date(warrantyStartDate);
      if (!isNaN(warrantyDate.getTime())) updateData.warrantyStartDate = warrantyDate;
    }
    if (warrantyMonths !== undefined && warrantyMonths !== null && warrantyMonths !== '') {
      const months = parseInt(warrantyMonths);
      if (!isNaN(months)) updateData.warrantyMonths = months;
    }

    const updatedProjectDoc = await Project.findByIdAndUpdate(
      id,
      { $set: updateData },
      { runValidators: true, new: true }
    );

    if (!updatedProjectDoc) {
      return res.status(404).json({ success: false, error: "Project not found after update" });
    }

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

    await logUpdate(oldProjectData, updatedProject, user, req, 'Project');

    return res.status(200).json({ success: true, message: "Project Updated Successfully" });
  } catch (error) {
    console.error("Error updating project:", error);
    return res.status(500).json({ error: "Error While Updating Project: " + error.message });
  }
};