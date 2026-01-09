const DeliveryChallan = require("../models/deliveryChallanModel");

exports.getDeliveryChallan = async (req, res) => {
  try {
    const dc = await DeliveryChallan.findById(req.params.id)
    
      .populate('customer', 'custName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!dc) {
      return res.status(404).json({ success: false, error: "Delivery challan not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "Delivery challan fetched successfully", 
      dc 
    });
  } catch (error) {
    res.status(500).json({ error: "Error in getting delivery challan: " + error.message });
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
          { dcNumber: { $regex: searchRegex } },
          { poNumber: { $regex: searchRegex } },
          { choice: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const deliveryChallans = await DeliveryChallan.find(query)
      .skip(skip)
      .limit(limit)
      .populate('customer', 'custName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (deliveryChallans.length === 0) {
      return res.status(404).json({ success: false, error: "No delivery challans found" });
    }

    const totalDCs = await DeliveryChallan.countDocuments(query);
    const totalPages = Math.ceil(totalDCs / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      deliveryChallans,
      pagination: {
        currentPage: page,
        totalPages,
        totalDCs,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching delivery challans: " + error.message,
    });
  }
};

exports.createDeliveryChallan = async (req, res) => {
  try {
    const user = req.user;
    const dcData = req.body;

    const newDC = new DeliveryChallan({
      ...dcData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newDC) {
      await newDC.save();
      
      res.status(201).json({
        success: true,
        message: "Delivery challan created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid delivery challan data" 
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
        error: "Error creating delivery challan: " + error.message 
      });
    }
  }
};

exports.deleteDeliveryChallan = async (req, res) => {
  try {
    const dcId = req.params.id;
    const dc = await DeliveryChallan.findByIdAndDelete(dcId);

    if (!dc) {
      return res.status(404).json({ 
        success: false, 
        error: "Delivery challan not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Delivery challan deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting delivery challan: " + error.message
    });
  }
};

exports.updateDeliveryChallan = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingDC = await DeliveryChallan.findById(id);

    if (!existingDC) {
      return res.status(404).json({ 
        success: false, 
        error: "Delivery challan not found" 
      });
    }

    const updatedDC = await DeliveryChallan.findByIdAndUpdate(
      id, 
      updatedData, 
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "Delivery challan updated successfully", 
      updatedDC 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating delivery challan: " + error.message 
    });
  }
};