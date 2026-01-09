const GRN = require("../models/grnModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for GRN documents
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads/grn directory if it doesn't exist
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Create a unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

exports.getGRN = async (req, res) => {
  try {
    const grn = await GRN.findById(req.params.id)
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!grn) {
      return res.status(404).json({ success: false, error: "GRN not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "GRN fetched successfully", 
      grn 
    });
  } catch (error) {
    res.status(500).json({ error: "Error in getting GRN: " + error.message });
  }
};

exports.getGRNByNumber = async (req, res) => {
  try {
    const { grnNumber } = req.params;
    console.log("Looking for GRN with number:", grnNumber);
    
    const grn = await GRN.findOne({ grnNumber: decodeURIComponent(grnNumber) })
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!grn) {
      console.log("GRN not found with number:", grnNumber);
      return res.status(404).json({ success: false, error: "GRN not found" });
    }
    
    console.log("Found GRN:", grn.grnNumber);
    res.status(200).json({ 
      success: true, 
      message: "GRN fetched successfully", 
      grn 
    });
  } catch (error) {
    console.error("Error in getGRNByNumber:", error);
    res.status(500).json({ error: "Error in getting GRN: " + error.message });
  }
};

exports.getGRNNumbers = async (req, res) => {
  try {
    const user = req.user;
    console.log("Getting GRN numbers for user:", user._id, "Company:", user.company);
    
    const grns = await GRN.find({ 
      company: user.company ? user.company : user._id
    })
    .select('grnNumber _id')
    .sort({ createdAt: -1 });
    
    console.log("Found GRNs:", grns.length);
    
    res.status(200).json({ 
      success: true, 
      message: "GRN numbers fetched successfully", 
      grns 
    });
  } catch (error) {
    console.error("Error in getGRNNumbers:", error);
    res.status(500).json({ error: "Error in getting GRN numbers: " + error.message });
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
          { grnNumber: { $regex: searchRegex } },
          { choice: { $regex: searchRegex } },
          { status: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const grns = await GRN.find(query)
      .skip(skip)
      .limit(limit)
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (grns.length === 0) {
      return res.status(404).json({ success: false, error: "No GRNs found" });
    }

    const totalGRNs = await GRN.countDocuments(query);
    const totalPages = Math.ceil(totalGRNs / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      grns,
      pagination: {
        currentPage: page,
        totalPages,
        totalGRNs,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching GRNs: " + error.message,
    });
  }
};

exports.createGRN = async (req, res) => {
  try {
    const user = req.user;
    const grnData = req.body;

    // If Against PO, update PO status based on received quantities
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      const po = await PurchaseOrder.findById(grnData.purchaseOrder);
      
      if (!po) {
        return res.status(404).json({ 
          success: false, 
          error: "Purchase order not found" 
        });
      }

      // Check if all items are fully received
      let allReceived = true;
      let partiallyReceived = false;

      for (let item of grnData.items) {
        const poItem = po.items.find(i => 
          i.brandName === item.brandName && i.modelNo === item.modelNo
        );
        
        if (poItem) {
          if (item.receivedQuantity < poItem.quantity) {
            allReceived = false;
            partiallyReceived = true;
          }
        }
      }

      // Update PO status
      if (allReceived) {
        po.status = 'Received';
      } else if (partiallyReceived) {
        po.status = 'Partially Received';
      }

      await po.save();
    }

    const newGRN = new GRN({
      ...grnData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newGRN) {
      await newGRN.save();
      
      res.status(201).json({
        success: true,
        message: "GRN created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid GRN data" 
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
        error: "Error creating GRN: " + error.message 
      });
    }
  }
};

exports.createGRNWithDocument = async (req, res) => {
  try {
    // Ensure uploads directory exists
    const fs = require('fs');
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const user = req.user;
    const grnData = JSON.parse(req.body.grnData);
    
    // If a file was uploaded, add the file information to the GRN data
    if (req.file) {
      const file = req.file;
      grnData.attachments = [{
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        path: `/uploads/grn/${file.filename}`
      }];
    }

    // If Against PO, update PO status based on received quantities
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      const po = await PurchaseOrder.findById(grnData.purchaseOrder);
      
      if (!po) {
        return res.status(404).json({ 
          success: false, 
          error: "Purchase order not found" 
        });
      }

      // Check if all items are fully received
      let allReceived = true;
      let partiallyReceived = false;

      for (let item of grnData.items) {
        const poItem = po.items.find(i => 
          i.brandName === item.brandName && i.modelNo === item.modelNo
        );
        
        if (poItem) {
          if (item.receivedQuantity < poItem.quantity) {
            allReceived = false;
            partiallyReceived = true;
          }
        }
      }

      // Update PO status
      if (allReceived) {
        po.status = 'Received';
      } else if (partiallyReceived) {
        po.status = 'Partially Received';
      }

      await po.save();
    }

    const newGRN = new GRN({
      ...grnData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newGRN) {
      await newGRN.save();
      
      res.status(201).json({
        success: true,
        message: "GRN created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid GRN data" 
      });
    }
  } catch (error) {
    console.error("Error in createGRNWithDocument:", error);
    if (error.name === "ValidationError") {
      res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error creating GRN: " + error.message 
      });
    }
  }
};

exports.deleteGRN = async (req, res) => {
  try {
    const grnId = req.params.id;
    const grn = await GRN.findByIdAndDelete(grnId);

    if (!grn) {
      return res.status(404).json({ 
        success: false, 
        error: "GRN not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "GRN deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting GRN: " + error.message
    });
  }
};

exports.updateGRN = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingGRN = await GRN.findById(id);

    if (!existingGRN) {
      return res.status(404).json({ 
        success: false, 
        error: "GRN not found" 
      });
    }

    const updatedGRN = await GRN.findByIdAndUpdate(
      id, 
      updatedData, 
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "GRN updated successfully", 
      updatedGRN 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating GRN: " + error.message 
    });
  }
};

exports.updateGRNWithDocument = async (req, res) => {
  try {
    // Ensure uploads directory exists
    const fs = require('fs');
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const { id } = req.params;
    const grnData = JSON.parse(req.body.grnData);
    
    // If a file was uploaded, add the file information to the GRN data
    if (req.file) {
      const file = req.file;
      grnData.attachments = [{
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        path: `/uploads/grn/${file.filename}`
      }];
    }

    const existingGRN = await GRN.findById(id);

    if (!existingGRN) {
      return res.status(404).json({ 
        success: false, 
        error: "GRN not found" 
      });
    }

    const updatedGRN = await GRN.findByIdAndUpdate(
      id, 
      grnData, 
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "GRN updated successfully", 
      updatedGRN 
    });
  } catch (error) {
    console.error("Error in updateGRNWithDocument:", error);
    res.status(500).json({
      success: false, 
      error: "Error updating GRN: " + error.message 
    });
  }
};