const QualityInspection = require("../models/qualityInspectionModel");

exports.getQualityInspection = async (req, res) => {
  try {
    const qc = await QualityInspection.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!qc) {
      return res.status(404).json({ success: false, error: "Quality inspection not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "Quality inspection fetched successfully", 
      qc 
    });
  } catch (error) {
    res.status(500).json({ error: "Error in getting quality inspection: " + error.message });
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
          { qcNumber: { $regex: searchRegex } },
          { grnNumber: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const qualityInspections = await QualityInspection.find(query)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (qualityInspections.length === 0) {
      return res.status(404).json({ success: false, error: "No quality inspections found" });
    }

    const totalQCs = await QualityInspection.countDocuments(query);
    const totalPages = Math.ceil(totalQCs / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      qualityInspections,
      pagination: {
        currentPage: page,
        totalPages,
        totalQCs,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching quality inspections: " + error.message,
    });
  }
};

exports.createQualityInspection = async (req, res) => {
  try {
    const user = req.user;
    const qcData = req.body;

    const newQC = new QualityInspection({
      ...qcData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newQC) {
      await newQC.save();
      
      res.status(201).json({
        success: true,
        message: "Quality inspection created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid quality inspection data" 
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
        error: "Error creating quality inspection: " + error.message 
      });
    }
  }
};

exports.deleteQualityInspection = async (req, res) => {
  try {
    const qcId = req.params.id;
    const qc = await QualityInspection.findByIdAndDelete(qcId);

    if (!qc) {
      return res.status(404).json({ 
        success: false, 
        error: "Quality inspection not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Quality inspection deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting quality inspection: " + error.message
    });
  }
};

exports.updateQualityInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingQC = await QualityInspection.findById(id);

    if (!existingQC) {
      return res.status(404).json({ 
        success: false, 
        error: "Quality inspection not found" 
      });
    }

    const updatedQC = await QualityInspection.findByIdAndUpdate(
      id, 
      updatedData, 
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "Quality inspection updated successfully", 
      updatedQC 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating quality inspection: " + error.message 
    });
  }
};