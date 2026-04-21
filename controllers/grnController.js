const mongoose = require('mongoose');
const { GRN, Counter } = require("../models/grnModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for GRN documents
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Helper function to get financial year
function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// Helper function to generate GRN number with better error handling
async function generateUniqueGRNNumber(companyId, grnDate) {
  const financialYear = getFinancialYear(grnDate);
  console.log(`Generating GRN number for company: ${companyId}, financial year: ${financialYear}`);

  try {
    const counter = await Counter.findOneAndUpdate(
      { company: companyId, financialYear: financialYear },
      {
        $inc: { sequence: 1 },
        $setOnInsert: {
          company: companyId,
          financialYear: financialYear,
          sequence: 1
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        returnDocument: 'after'
      }
    );

    console.log(`Counter updated: sequence = ${counter.sequence}`);

    const formattedSerial = String(counter.sequence).padStart(3, '0');
    const grnNumber = `GRN/${financialYear}/${formattedSerial}`;

    // Double-check if this GRN number already exists
    const existingGRN = await GRN.findOne({ grnNumber });
    if (existingGRN) {
      console.log(`GRN number ${grnNumber} already exists, incrementing counter...`);

      const newCounter = await Counter.findOneAndUpdate(
        { company: companyId, financialYear: financialYear },
        { $inc: { sequence: 1 } },
        { new: true }
      );

      const newFormattedSerial = String(newCounter.sequence).padStart(3, '0');
      const newGrnNumber = `GRN/${financialYear}/${newFormattedSerial}`;

      const existingGRN2 = await GRN.findOne({ grnNumber: newGrnNumber });
      if (existingGRN2) {
        throw new Error(`Multiple GRN number conflicts detected for ${financialYear}`);
      }

      return newGrnNumber;
    }

    return grnNumber;
  } catch (error) {
    console.error("Error generating GRN number:", error);

    // Fallback: Find the maximum existing GRN number and increment
    try {
      const existingGRNs = await GRN.find({
        company: companyId,
        grnNumber: { $regex: `^GRN/${financialYear}/` }
      }).sort({ grnNumber: -1 }).limit(1);

      let nextSequence = 1;
      if (existingGRNs.length > 0) {
        const lastGRNNumber = existingGRNs[0].grnNumber;
        const lastSequence = parseInt(lastGRNNumber.split('/')[2]);
        if (!isNaN(lastSequence)) {
          nextSequence = lastSequence + 1;
        }
      }

      await Counter.findOneAndUpdate(
        { company: companyId, financialYear: financialYear },
        { sequence: nextSequence },
        { upsert: true }
      );

      const formattedSerial = String(nextSequence).padStart(3, '0');
      const grnNumber = `GRN/${financialYear}/${formattedSerial}`;

      const existingGRN = await GRN.findOne({ grnNumber });
      if (existingGRN) {
        throw new Error(`Unable to generate unique GRN number after all attempts`);
      }

      return grnNumber;
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      throw new Error(`Failed to generate GRN number: ${error.message}`);
    }
  }
}

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

    res.status(200).json({ success: true, message: "GRN fetched successfully", grn });
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
      return res.status(404).json({ success: false, error: "GRN not found" });
    }

    res.status(200).json({ success: true, message: "GRN fetched successfully", grn });
  } catch (error) {
    console.error("Error in getGRNByNumber:", error);
    res.status(500).json({ error: "Error in getting GRN: " + error.message });
  }
};

exports.getGRNNumbers = async (req, res) => {
  try {
    const user = req.user;
    const grns = await GRN.find({ company: user.company ? user.company : user._id })
      .select('grnNumber _id')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, message: "GRN numbers fetched successfully", grns });
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
      query = { company: user.company || user._id };
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
      pagination: { currentPage: page, totalPages, totalGRNs, limit, hasNextPage, hasPrevPage },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching GRNs: " + error.message });
  }
};

// ─── CREATE GRN (no session/transaction — works on standalone MongoDB) ────────
exports.createGRN = async (req, res) => {
  try {
    const user = req.user;
    const grnData = req.body;
    const companyId = user.company ? user.company : user._id;

    // Generate unique GRN number
    const grnNumber = await generateUniqueGRNNumber(companyId, new Date(grnData.grnDate));
    console.log("Generated GRN number:", grnNumber);

    // If Against PO, update PO received quantities
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      const po = await PurchaseOrder.findById(grnData.purchaseOrder);

      if (!po) {
        return res.status(404).json({ success: false, error: "Purchase order not found" });
      }

      for (let grnItem of grnData.items) {
        const poItem = po.items.find(
          i => i.brandName === grnItem.brandName && i.modelNo === grnItem.modelNo
        );

        if (poItem) {
          if (!poItem.receivedQuantity) poItem.receivedQuantity = 0;
          poItem.receivedQuantity += grnItem.receivedQuantity;

          if (poItem.receivedQuantity > poItem.quantity) {
            return res.status(400).json({
              success: false,
              error: `Received quantity for ${poItem.brandName} - ${poItem.modelNo} exceeds ordered quantity`
            });
          }
        }
      }

      // Update PO status
      let allReceived = true;
      let partiallyReceived = false;

      for (let item of po.items) {
        const received = item.receivedQuantity || 0;
        if (received < item.quantity) {
          allReceived = false;
          if (received > 0) partiallyReceived = true;
        }
      }

      if (allReceived) {
        po.status = 'Received';
      } else if (partiallyReceived) {
        po.status = 'Partially Received';
      }

      await po.save();
    }

    const newGRN = new GRN({
      ...grnData,
      grnNumber,
      company: companyId,
      createdBy: user._id,
    });

    await newGRN.save();

    res.status(201).json({
      success: true,
      message: "GRN created successfully",
      grnNumber: newGRN.grnNumber
    });
  } catch (error) {
    console.error("Error in createGRN:", error);

    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: "Duplicate GRN number generated. Please try again." });
    } else if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ error: "Error creating GRN: " + error.message });
  }
};

// ─── CREATE GRN WITH DOCUMENT (no session/transaction) ───────────────────────
exports.createGRNWithDocument = async (req, res) => {
  try {
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const user = req.user;
    const grnData = JSON.parse(req.body.grnData);
    const companyId = user.company ? user.company : user._id;

    // Generate unique GRN number
    const grnNumber = await generateUniqueGRNNumber(companyId, new Date(grnData.grnDate));
    console.log("Generated GRN number with document:", grnNumber);

    // Attach uploaded file info
    if (req.file) {
      const file = req.file;
      grnData.attachments = [{
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        path: `/uploads/grn/${file.filename}`
      }];
    }

    // If Against PO, update PO received quantities
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      const po = await PurchaseOrder.findById(grnData.purchaseOrder);

      if (!po) {
        return res.status(404).json({ success: false, error: "Purchase order not found" });
      }

      for (let grnItem of grnData.items) {
        const poItem = po.items.find(
          i => i.brandName === grnItem.brandName && i.modelNo === grnItem.modelNo
        );

        if (poItem) {
          if (!poItem.receivedQuantity) poItem.receivedQuantity = 0;
          poItem.receivedQuantity += grnItem.receivedQuantity;

          if (poItem.receivedQuantity > poItem.quantity) {
            return res.status(400).json({
              success: false,
              error: `Received quantity for ${poItem.brandName} - ${poItem.modelNo} exceeds ordered quantity`
            });
          }
        }
      }

      let allReceived = true;
      let partiallyReceived = false;

      for (let item of po.items) {
        const received = item.receivedQuantity || 0;
        if (received < item.quantity) {
          allReceived = false;
          if (received > 0) partiallyReceived = true;
        }
      }

      if (allReceived) {
        po.status = 'Received';
      } else if (partiallyReceived) {
        po.status = 'Partially Received';
      }

      await po.save();
    }

    const newGRN = new GRN({
      ...grnData,
      grnNumber,
      company: companyId,
      createdBy: user._id,
    });

    await newGRN.save();

    res.status(201).json({
      success: true,
      message: "GRN created successfully",
      grnNumber: newGRN.grnNumber
    });
  } catch (error) {
    console.error("Error in createGRNWithDocument:", error);

    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: "Duplicate GRN number generated. Please try again." });
    } else if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ error: "Error creating GRN: " + error.message });
  }
};

exports.deleteGRN = async (req, res) => {
  try {
    const grnId = req.params.id;
    const grn = await GRN.findByIdAndDelete(grnId);

    if (!grn) {
      return res.status(404).json({ success: false, error: "GRN not found" });
    }

    res.status(200).json({ success: true, message: "GRN deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while deleting GRN: " + error.message });
  }
};

exports.updateGRN = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingGRN = await GRN.findById(id);
    if (!existingGRN) {
      return res.status(404).json({ success: false, error: "GRN not found" });
    }

    const updatedGRN = await GRN.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });

    res.status(200).json({ success: true, message: "GRN updated successfully", updatedGRN });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating GRN: " + error.message });
  }
};

exports.updateGRNWithDocument = async (req, res) => {
  try {
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const { id } = req.params;
    const grnData = JSON.parse(req.body.grnData);

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
      return res.status(404).json({ success: false, error: "GRN not found" });
    }

    const updatedGRN = await GRN.findByIdAndUpdate(id, grnData, { new: true, runValidators: true });

    res.status(200).json({ success: true, message: "GRN updated successfully", updatedGRN });
  } catch (error) {
    console.error("Error in updateGRNWithDocument:", error);
    res.status(500).json({ success: false, error: "Error updating GRN: " + error.message });
  }
};