const MRF = require("../models/mrfModel");

exports.getMRF = async (req, res) => {
  try {
    const mrf = await MRF.findById(req.params.id)
      .populate('customer', 'custName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!mrf) {
      return res.status(404).json({ success: false, error: "MRF not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "MRF fetched successfully", 
      mrf 
    });
  } catch (error) {
    res.status(500).json({ error: "Error in getting MRF: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;

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
          { mrfNumber: { $regex: searchRegex } },
          { poNumber: { $regex: searchRegex } },
          { choice: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const mrfs = await MRF.find(query)
      .skip(skip)
      .limit(limit)
      .populate('customer', 'custName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (mrfs.length === 0) {
      return res.status(404).json({ success: false, error: "No MRFs found" });
    }

    const totalMRFs = await MRF.countDocuments(query);
    const totalPages = Math.ceil(totalMRFs / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      mrfs,
      pagination: {
        currentPage: page,
        totalPages,
        totalMRFs,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching MRFs: " + error.message,
    });
  }
};

exports.createMRF = async (req, res) => {
  try {
    const user = req.user;
    const mrfData = req.body;

    const newMRF = new MRF({
      ...mrfData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newMRF) {
      await newMRF.save();
      
      res.status(201).json({
        success: true,
        message: "MRF created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid MRF data" 
      });
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error creating MRF: " + error.message 
      });
    }
  }
};

exports.deleteMRF = async (req, res) => {
  try {
    const mrfId = req.params.id;
    const mrf = await MRF.findByIdAndDelete(mrfId);

    if (!mrf) {
      return res.status(404).json({ 
        success: false, 
        error: "MRF not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "MRF deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting MRF: " + error.message
    });
  }
};

exports.updateMRF = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingMRF = await MRF.findById(id);

    if (!existingMRF) {
      return res.status(404).json({ 
        success: false, 
        error: "MRF not found" 
      });
    }

    // Validate status transitions
    if (updatedData.status && updatedData.status !== existingMRF.status) {
      const validTransitions = {
        'Pending': ['Approved', 'Rejected'],
        'Approved': ['Processed'],
        'Rejected': ['Pending'],
        'Processed': []
      };

      if (!validTransitions[existingMRF.status].includes(updatedData.status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot change status from ${existingMRF.status} to ${updatedData.status}`
        });
      }
    }

    const updatedMRF = await MRF.findByIdAndUpdate(
      id, 
      updatedData, 
      {
        new: true,
        runValidators: true,
      }
    ).populate('customer', 'custName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');

    res.status(200).json({ 
      success: true, 
      message: "MRF updated successfully", 
      updatedMRF 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating MRF: " + error.message 
    });
  }
};