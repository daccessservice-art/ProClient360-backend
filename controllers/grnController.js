const mongoose = require('mongoose');
const { GRN, Counter } = require("../models/grnModel");
const PurchaseOrder = require("../models/purchaseOrderModel");
const Product = require("../models/productModel");
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

// ─── Helper: get financial year ───────────────────────────────────────────────
function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// ─── Helper: generate unique GRN number (FIXED) ──────────────────────────────
async function generateUniqueGRNNumber(companyId, grnDate) {
  const financialYear = getFinancialYear(grnDate);
  console.log(`Generating GRN number for company: ${companyId}, financial year: ${financialYear}`);

  // STEP 1: Sync counter with existing GRNs in DB
  const escapedFY = financialYear.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lastGRN = await GRN.findOne({
    company: companyId,
    grnNumber: { $regex: `^GRN/${escapedFY}/` }
  }).sort({ grnNumber: -1 });

  if (lastGRN) {
    const parts = lastGRN.grnNumber.split('/');
    const lastSequence = parseInt(parts[parts.length - 1], 10);

    const currentCounter = await Counter.findOne({ company: companyId, financialYear });
    if (!currentCounter || currentCounter.sequence <= lastSequence) {
      console.log(`Syncing counter from ${currentCounter?.sequence || 'N/A'} to ${lastSequence}`);
      await Counter.findOneAndUpdate(
        { company: companyId, financialYear: financialYear },
        { $set: { sequence: lastSequence } },
        { upsert: true }
      );
    }
  }

  // STEP 2: Atomically increment and generate
  const counter = await Counter.findOneAndUpdate(
    { company: companyId, financialYear: financialYear },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );

  const formattedSerial = String(counter.sequence).padStart(3, '0');
  const grnNumber = `GRN/${financialYear}/${formattedSerial}`;
  console.log(`GRN number generated: ${grnNumber}`);

  return grnNumber;
}

// ─── Helper: update PO received quantities (NO validation) ─────────────────
async function updatePOReceivedQuantity(purchaseOrderId, items) {
  if (!purchaseOrderId) return;
  try {
    const po = await PurchaseOrder.findById(purchaseOrderId);
    if (!po) return;

    for (let grnItem of items) {
      const poItem = po.items.find(
        i => i.brandName === grnItem.brandName && i.modelNo === grnItem.modelNo
      );
      if (poItem) {
        if (!poItem.receivedQuantity) poItem.receivedQuantity = 0;
        poItem.receivedQuantity += (parseFloat(grnItem.receivedQuantity) || 0);
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
    if (allReceived) po.status = 'Received';
    else if (partiallyReceived) po.status = 'Partially Received';
    else po.status = 'Pending';
    await po.save();
  } catch (err) {
    console.error('Error updating PO received quantity:', err.message);
  }
}

// ─── Helper: reverse PO received quantities ────────────────────────────────
async function reversePOQuantities(grn) {
  if (!grn || grn.choice !== 'Against PO' || !grn.purchaseOrder) return;
  try {
    const po = await PurchaseOrder.findById(grn.purchaseOrder);
    if (!po) return;

    for (const grnItem of grn.items) {
      const poItem = po.items.find(
        i => i.brandName === grnItem.brandName && i.modelNo === grnItem.modelNo
      );
      if (poItem && poItem.receivedQuantity) {
        poItem.receivedQuantity -= (parseFloat(grnItem.receivedQuantity) || 0);
        if (poItem.receivedQuantity < 0) poItem.receivedQuantity = 0;
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
    if (allReceived) po.status = 'Received';
    else if (partiallyReceived) po.status = 'Partially Received';
    else po.status = 'Pending';
    await po.save();
  } catch (err) {
    console.error('Error reversing PO quantities:', err.message);
  }
}

// ─── Helper: update Product stock after GRN ───────────────────────────────────
async function updateProductStockOnGRN(items, companyId) {
  for (const item of items) {
    if (!item.brandName || !item.modelNo || !item.receivedQuantity) continue;
    const received = parseFloat(item.receivedQuantity) || 0;
    if (received <= 0) continue;

    try {
      const updated = await Product.findOneAndUpdate(
        { company: companyId, brandName: item.brandName, model: item.modelNo },
        { $inc: { currentStockQty: received } },
        { new: true }
      );
      if (updated) {
        console.log(`Stock updated: ${item.brandName} / ${item.modelNo} -> +${received}`);
      }
    } catch (err) {
      console.error(`Error updating stock:`, err.message);
    }
  }
}

// ─── Helper: reverse Product stock ───────────────────────────────────────────
async function reverseProductStockOnGRN(oldItems, companyId) {
  for (const item of oldItems) {
    if (!item.brandName || !item.modelNo || !item.receivedQuantity) continue;
    const received = parseFloat(item.receivedQuantity) || 0;
    if (received <= 0) continue;

    try {
      const updated = await Product.findOneAndUpdate(
        { company: companyId, brandName: item.brandName, model: item.modelNo },
        { $inc: { currentStockQty: -received } },
        { new: true }
      );
      if (updated) {
        console.log(`Stock reversed: ${item.brandName} / ${item.modelNo} -> -${received}`);
      }
    } catch (err) {
      console.error(`Error reversing stock:`, err.message);
    }
  }
}

// ─── CONTROLLERS ──────────────────────────────────────────────────────────────

exports.getGRN = async (req, res) => {
  try {
    const grn = await GRN.findById(req.params.id)
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');

    if (!grn) return res.status(404).json({ success: false, error: "GRN not found" });
    res.status(200).json({ success: true, message: "GRN fetched successfully", grn });
  } catch (error) {
    res.status(500).json({ error: "Error in getting GRN: " + error.message });
  }
};

exports.getGRNByNumber = async (req, res) => {
  try {
    const { grnNumber } = req.params;
    const grn = await GRN.findOne({ grnNumber: decodeURIComponent(grnNumber) })
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('purchaseOrder', 'orderNumber')
      .populate('createdBy', 'name email')
      .populate('company', 'name');

    if (!grn) return res.status(404).json({ success: false, error: "GRN not found" });
    res.status(200).json({ success: true, message: "GRN fetched successfully", grn });
  } catch (error) {
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

    res.status(200).json({
      success: true,
      grns,
      pagination: {
        currentPage: page,
        totalPages,
        totalGRNs,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching GRNs: " + error.message });
  }
};

// ─── CREATE GRN (NO validation block - always creates) ─────────────────────
exports.createGRN = async (req, res) => {
  try {
    const user = req.user;
    const grnData = req.body;
    const companyId = user.company ? user.company : user._id;

    const grnNumber = await generateUniqueGRNNumber(companyId, new Date(grnData.grnDate));
    console.log("Generated GRN number:", grnNumber);

    const newGRN = new GRN({
      ...grnData,
      grnNumber,
      company: companyId,
      createdBy: user._id,
    });
    await newGRN.save();

    // Update PO received quantities (no validation - just updates)
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      await updatePOReceivedQuantity(grnData.purchaseOrder, grnData.items);
    }

    // Update product stock
    await updateProductStockOnGRN(grnData.items, companyId);

    res.status(201).json({
      success: true,
      message: "GRN created successfully",
      grnNumber: newGRN.grnNumber
    });
  } catch (error) {
    console.error("Error in createGRN:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: "Duplicate GRN number. Please try again." });
    } else if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ error: "Error creating GRN: " + error.message });
  }
};

// ─── CREATE GRN WITH DOCUMENT (NO validation block) ────────────────────────
exports.createGRNWithDocument = async (req, res) => {
  try {
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const user = req.user;
    const grnData = JSON.parse(req.body.grnData);
    const companyId = user.company ? user.company : user._id;

    const grnNumber = await generateUniqueGRNNumber(companyId, new Date(grnData.grnDate));
    console.log("Generated GRN number with document:", grnNumber);

    if (req.file) {
      grnData.attachments = [{
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/grn/${req.file.filename}`
      }];
    }

    const newGRN = new GRN({
      ...grnData,
      grnNumber,
      company: companyId,
      createdBy: user._id,
    });
    await newGRN.save();

    // Update PO received quantities (no validation - just updates)
    if (grnData.choice === 'Against PO' && grnData.purchaseOrder) {
      await updatePOReceivedQuantity(grnData.purchaseOrder, grnData.items);
    }

    // Update product stock
    await updateProductStockOnGRN(grnData.items, companyId);

    res.status(201).json({
      success: true,
      message: "GRN created successfully",
      grnNumber: newGRN.grnNumber
    });
  } catch (error) {
    console.error("Error in createGRNWithDocument:", error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: "Duplicate GRN number. Please try again." });
    } else if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ error: "Error creating GRN: " + error.message });
  }
};

// ─── DELETE GRN (reverses PO + stock) ─────────────────────────────────────
exports.deleteGRN = async (req, res) => {
  try {
    const grnId = req.params.id;

    const grn = await GRN.findById(grnId);
    if (!grn) return res.status(404).json({ success: false, error: "GRN not found" });

    const companyId = grn.company;

    await reversePOQuantities(grn);
    await reverseProductStockOnGRN(grn.items, companyId);
    await GRN.findByIdAndDelete(grnId);

    res.status(200).json({ success: true, message: "GRN deleted successfully" });
  } catch (error) {
    console.error("Error in deleteGRN:", error);
    res.status(500).json({ success: false, error: "Error while deleting GRN: " + error.message });
  }
};

// ─── UPDATE GRN (reverses old, applies new - NO validation block) ──────────
exports.updateGRN = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingGRN = await GRN.findById(id);
    if (!existingGRN) return res.status(404).json({ success: false, error: "GRN not found" });

    const companyId = existingGRN.company;

    // Reverse old
    await reversePOQuantities(existingGRN);
    await reverseProductStockOnGRN(existingGRN.items, companyId);

    // Update
    const updatedGRN = await GRN.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });

    // Apply new PO quantities (no validation)
    if (updatedGRN.choice === 'Against PO' && updatedGRN.purchaseOrder) {
      await updatePOReceivedQuantity(updatedGRN.purchaseOrder, updatedGRN.items);
    }

    // Apply new stock
    await updateProductStockOnGRN(updatedGRN.items, companyId);

    res.status(200).json({ success: true, message: "GRN updated successfully", updatedGRN });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating GRN: " + error.message });
  }
};

// ─── UPDATE GRN WITH DOCUMENT (NO validation block) ────────────────────────
exports.updateGRNWithDocument = async (req, res) => {
  try {
    const dir = 'uploads/grn';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const { id } = req.params;
    const grnData = JSON.parse(req.body.grnData);

    if (req.file) {
      grnData.attachments = [{
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        path: `/uploads/grn/${req.file.filename}`
      }];
    }

    const existingGRN = await GRN.findById(id);
    if (!existingGRN) return res.status(404).json({ success: false, error: "GRN not found" });

    const companyId = existingGRN.company;

    // Reverse old
    await reversePOQuantities(existingGRN);
    await reverseProductStockOnGRN(existingGRN.items, companyId);

    // Update
    const updatedGRN = await GRN.findByIdAndUpdate(id, grnData, { new: true, runValidators: true });

    // Apply new PO quantities (no validation)
    if (updatedGRN.choice === 'Against PO' && updatedGRN.purchaseOrder) {
      await updatePOReceivedQuantity(updatedGRN.purchaseOrder, updatedGRN.items);
    }

    // Apply new stock
    await updateProductStockOnGRN(updatedGRN.items, companyId);

    res.status(200).json({ success: true, message: "GRN updated successfully", updatedGRN });
  } catch (error) {
    console.error("Error in updateGRNWithDocument:", error);
    res.status(500).json({ success: false, error: "Error updating GRN: " + error.message });
  }
};