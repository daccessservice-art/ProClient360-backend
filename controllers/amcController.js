const AMC = require('../models/amcModel');

exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;
    
    const { q, type, status } = req.query;
    
    console.log("Query parameters:", { q, type, status });
    
    const searchRegex = new RegExp(q, 'i');
    let query = {};
    
    // Base query - filter by company
    query = { company: user.company ? user.company : user._id };
    
    // Add search filter if provided
    if (q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined") {
      
      skip = 0;
      page = 1;
      query.$or = [
        { invoiceNumber: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ];
    }
    
    // Add type filter if provided
    if (type !== undefined &&
      type !== null &&
      type.trim() !== "" &&
      type.trim().toLowerCase() !== "null" &&
      type.trim().toLowerCase() !== "undefined") {
      
      query.type = type;
    }
    
    // Add status filter if provided
    if (status !== undefined &&
      status !== null &&
      status.trim() !== "" &&
      status.trim().toLowerCase() !== "null" &&
      status.trim().toLowerCase() !== "undefined") {
      
      query.status = status;
    }
    
    console.log("Final query:", JSON.stringify(query));
    
    const amcs = await AMC.find(query)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log("Found AMCs:", amcs.length);
    
    if (amcs.length <= 0) {
      return res.status(200).json({ success: true, data: [], pagination: {
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        limit,
        hasNextPage: false,
        hasPrevPage: false,
      } });
    }
    
    const totalRecords = await AMC.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.status(200).json({
      success: true,
      data: amcs,
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
    console.error("Error in showAll:", error);
    res.status(500).json({ success: false, error: "Error while fetching AMCs: " + error.message });
  }
};

exports.getAMC = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const amc = await AMC.findOne({
      _id: id,
      company: user.company ? user.company : user._id
    })
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email');
    
    if (!amc) {
      return res.status(404).json({ success: false, error: "AMC not found" });
    }
    
    res.status(200).json({ success: true, data: amc });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error in getting AMC: " + error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const user = req.user;
    const query = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {
      company: user.company ? user.company : user._id,
      $or: [
        { invoiceNumber: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };
    
    const amcs = await AMC.find(filter)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name');
    
    if (amcs.length <= 0) {
      return res.status(200).json({ success: true, data: [], pagination: {
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        limit,
        hasNextPage: false,
        hasPrevPage: false,
      } });
    }
    
    const totalRecords = await AMC.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: amcs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        hasNextPage: page < Math.ceil(totalRecords / limit),
        hasPrevPage: page > 1,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while searching AMCs: " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      type,
      invoiceNumber,
      invoiceDate,
      invoiceAmount,
      amcStartDate,
      amcEndDate,
      quotationAmount,
      description,
      customerType,
      customerId,
      customerName,
      contactPerson,
      email,
      contact,
      address
    } = req.body;
    
    // Check if invoice number already exists (if provided)
    if (invoiceNumber) {
      const existingAMC = await AMC.findOne({ invoiceNumber });
      if (existingAMC) {
        return res.status(409).json({ success: false, error: "AMC with this invoice number already exists" });
      }
    }
    
    // Create new AMC
    const newAMC = new AMC({
      type,
      invoiceNumber,
      invoiceDate,
      invoiceAmount,
      amcStartDate,
      amcEndDate,
      quotationAmount,
      description,
      // Customer information
      customerType,
      customerId,
      customerName,
      contactPerson,
      email,
      contact,
      address,
      company: req.user.company || req.user._id,
      createdBy: req.user._id
    });
    
    if (newAMC) {
      await newAMC.save();
      res.status(201).json({
        success: true,
        message: `AMC ${invoiceNumber || 'without invoice number'} has been created successfully`,
        data: newAMC
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Invalid AMC Data"
      });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: "Error While Creating AMC: " + error.message });
  }
};

exports.deleteAMC = async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.user;
    
    const amc = await AMC.findOne({ 
      _id: id,
      company: user.company ? user.company : user._id 
    });
    
    if (!amc) {
      return res.status(404).json({ success: false, error: "AMC not found" });
    }
    
    await AMC.findByIdAndDelete(id);
    
    res.status(200).json({ 
      success: true, 
      message: `AMC ${amc.invoiceNumber || 'without invoice number'} has been deleted successfully` 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: "Error while deleting AMC: " + error.message });
  }
};

exports.updateAMC = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const originalData = await AMC.findOne({
      _id: id,
      company: user.company ? user.company : user._id
    });
    
    if (!originalData) {
      return res.status(404).json({ success: false, error: 'AMC not found' });
    }
    
    const {
      type,
      invoiceNumber,
      invoiceDate,
      invoiceAmount,
      amcStartDate,
      amcEndDate,
      quotationAmount,
      description,
      customerName,
      contactPerson,
      email,
      contact,
      address,
      // Work data fields
      status,
      step,
      completion,
      nextFollowUpDate,
      rem
    } = req.body;
    
    // Check if invoice number already exists (if it's being changed)
    if (invoiceNumber && invoiceNumber !== originalData.invoiceNumber) {
      const existingAMC = await AMC.findOne({ invoiceNumber });
      if (existingAMC) {
        return res.status(409).json({ success: false, error: "AMC with this invoice number already exists" });
      }
    }
    
    const updateData = {
      type: 'CMC', // Force type to be CMC on update
      invoiceNumber,
      invoiceDate,
      invoiceAmount,
      amcStartDate,
      amcEndDate,
      quotationAmount,
      description,
      customerName,
      contactPerson,
      email,
      contact,
      address,
      // Work data fields
      status,
      step,
      completion: completion ? parseFloat(completion) : 0,
      nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      rem,
      lastUpdatedBy: req.user._id
    };
    
    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    
    await AMC.findByIdAndUpdate(id, { $set: updateData }, { runValidators: true });
    
    res.status(200).json({
      success: true,
      message: 'AMC data updated successfully'
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false, error: 'Error while updating AMC: ' + error.message });
  }
};