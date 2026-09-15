const DeliveryChallan = require("../models/deliveryChallanModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel"); // ⚠️ check this path/filename matches your project

// ─── Helper: deduct stock for an array of items ───────────────────────────────
const adjustProductStock = async (items, deductSign = -1) => {
  for (const item of items) {
    if (!item.brandName || !item.modelNo || !item.quantity) continue;

    const product = await Product.findOne({
      brandName: item.brandName,
      model: item.modelNo,
    });

    if (product) {
      const newQty = (product.currentStockQty || 0) + deductSign * item.quantity;
      product.currentStockQty = Math.max(0, newQty);
      await product.save();
    }
  }
};

// ─── GET single DC ────────────────────────────────────────────────────────────
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

// ─── GET all DCs (paginated + search) ─────────────────────────────────────────
exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;

    const { q } = req.query;
    let query = {};
    const companyId = user.company ? user.company : user._id;

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

      // ── NEW: find customers whose name matches the search text ──
      const matchingCustomers = await Customer.find({
        company: companyId,
        custName: { $regex: searchRegex }
      }).select('_id');

      const matchingCustomerIds = matchingCustomers.map(c => c._id);

      query = {
        company: companyId,
        $or: [
          { dcNumber: { $regex: searchRegex } },
          { poNumber: { $regex: searchRegex } },
          { choice: { $regex: searchRegex } },
          { customer: { $in: matchingCustomerIds } }, // ── NEW: search by customer name ──
        ],
      };
    } else {
      query = { company: companyId };
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

    res.status(200).json({
      success: true,
      deliveryChallans,
      pagination: {
        currentPage: page,
        totalPages,
        totalDCs,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching delivery challans: " + error.message,
    });
  }
};

// ─── CREATE DC ────────────────────────────────────────────────────────────────
exports.createDeliveryChallan = async (req, res) => {
  try {
    const user = req.user;
    const dcData = req.body;

    const newDC = new DeliveryChallan({
      ...dcData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (!newDC) {
      return res.status(400).json({ success: false, error: "Invalid delivery challan data" });
    }

    await newDC.save();

    if (dcData.items && dcData.items.length > 0) {
      await adjustProductStock(dcData.items, -1);
    }

    res.status(201).json({
      success: true,
      message: "Delivery challan created successfully",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ error: "Error creating delivery challan: " + error.message });
    }
  }
};

// ─── DELETE DC ────────────────────────────────────────────────────────────────
exports.deleteDeliveryChallan = async (req, res) => {
  try {
    const dcId = req.params.id;
    const dc = await DeliveryChallan.findById(dcId);

    if (!dc) {
      return res.status(404).json({ success: false, error: "Delivery challan not found" });
    }

    if (dc.items && dc.items.length > 0) {
      await adjustProductStock(dc.items, +1);
    }

    await DeliveryChallan.findByIdAndDelete(dcId);

    res.status(200).json({ success: true, message: "Delivery challan deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting delivery challan: " + error.message,
    });
  }
};

// ─── UPDATE DC ────────────────────────────────────────────────────────────────
exports.updateDeliveryChallan = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingDC = await DeliveryChallan.findById(id);
    if (!existingDC) {
      return res.status(404).json({ success: false, error: "Delivery challan not found" });
    }

    if (existingDC.items && existingDC.items.length > 0) {
      await adjustProductStock(existingDC.items, +1);
    }

    const updatedDC = await DeliveryChallan.findByIdAndUpdate(
      id,
      updatedData,
      { new: true, runValidators: true }
    );

    if (updatedData.items && updatedData.items.length > 0) {
      await adjustProductStock(updatedData.items, -1);
    }

    res.status(200).json({
      success: true,
      message: "Delivery challan updated successfully",
      updatedDC,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Error updating delivery challan: " + error.message,
    });
  }
};