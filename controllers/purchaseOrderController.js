const PurchaseOrder = require("../models/purchaseOrderModel");
const PurchaseOrderHistory = require("../models/purchaseOrderHistoryModel");

exports.getPurchaseOrder = async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('createdBy', 'name email')
      .populate('company', 'name');
    
    if (!purchaseOrder) {
      return res.status(404).json({ success: false, error: "Purchase order not found" });
    }
    
    res.status(200).json({ 
      success: true, 
      message: "Purchase order fetched successfully", 
      purchaseOrder 
    });
  } catch (error) {
    res.status(500).json({ error: "Error in getting purchase order: " + error.message });
  }
};

exports.getPurchaseOrderHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const history = await PurchaseOrderHistory.find({ purchaseOrder: id })
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error fetching purchase order history: " + error.message
    });
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
          { orderNumber: { $regex: searchRegex } },
          { transactionType: { $regex: searchRegex } },
          { status: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const purchaseOrders = await PurchaseOrder.find(query)
      .skip(skip)
      .limit(limit)
      .populate('vendor', 'vendorName email phoneNumber1')
      .populate('project', 'name')
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (purchaseOrders.length === 0) {
      return res.status(404).json({ success: false, error: "No purchase orders found" });
    }

    const totalPurchaseOrders = await PurchaseOrder.countDocuments(query);
    const totalPages = Math.ceil(totalPurchaseOrders / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      purchaseOrders,
      pagination: {
        currentPage: page,
        totalPages,
        totalPurchaseOrders,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching purchase orders: " + error.message,
    });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const user = req.user;
    const poData = req.body;

    // Check if order number already exists
    const existingPO = await PurchaseOrder.findOne({
      company: user.company ? user.company : user._id,
      orderNumber: poData.orderNumber,
    });

    if (existingPO) {
      return res.status(409).json({ 
        success: false, 
        error: "Purchase order with this order number already exists" 
      });
    }

    const newPurchaseOrder = new PurchaseOrder({
      ...poData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newPurchaseOrder) {
      await newPurchaseOrder.save();
      
      // Create history record
      await new PurchaseOrderHistory({
        purchaseOrder: newPurchaseOrder._id,
        updatedBy: user._id,
        updateType: 'CREATE',
        description: 'Purchase order created',
        newValues: { ...poData }
      }).save();
      
      res.status(201).json({
        success: true,
        message: "Purchase order created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid purchase order data" 
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
        error: "Error creating purchase order: " + error.message 
      });
    }
  }
};

exports.deletePurchaseOrder = async (req, res) => {
  try {
    const poId = req.params.id;
    const purchaseOrder = await PurchaseOrder.findByIdAndDelete(poId);

    if (!purchaseOrder) {
      return res.status(404).json({ 
        success: false, 
        error: "Purchase order not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Purchase order deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting purchase order: " + error.message
    });
  }
};

exports.updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const user = req.user;

    const existingPO = await PurchaseOrder.findById(id);

    if (!existingPO) {
      return res.status(404).json({ 
        success: false, 
        error: "Purchase order not found" 
      });
    }

    // Store previous values for history
    const previousValues = { ...existingPO._doc };
    
    // Check if status is being changed
    const statusChanged = existingPO.status !== updatedData.status;
    
    // Check if items are being updated
    const itemsChanged = JSON.stringify(existingPO.items) !== JSON.stringify(updatedData.items);
    
    // Check if price is being updated
    let priceChanged = false;
    let priceChangeDetails = [];
    
    if (itemsChanged) {
      const prevItemsMap = new Map(existingPO.items.map(item => [`${item.brandName}-${item.modelNo}`, item]));
      const newItemsMap = new Map(updatedData.items.map(item => [`${item.brandName}-${item.modelNo}`, item]));
      
      // Check for price changes in existing items
      for (const [key, newItem] of newItemsMap) {
        const prevItem = prevItemsMap.get(key);
        if (prevItem && prevItem.price !== newItem.price) {
          priceChanged = true;
          priceChangeDetails.push({
            brandName: newItem.brandName,
            modelNo: newItem.modelNo,
            previousPrice: prevItem.price,
            newPrice: newItem.price,
            changeAmount: newItem.price - prevItem.price,
            changePercent: ((newItem.price - prevItem.price) / prevItem.price * 100).toFixed(2)
          });
        }
      }
    }

    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id, 
      updatedData, 
      {
        new: true,
        runValidators: true,
      }
    );

    // Create history record
    let updateType = 'UPDATE';
    let description = 'Purchase order updated';
    
    if (statusChanged) {
      updateType = 'STATUS_CHANGE';
      description = `Status changed from ${existingPO.status} to ${updatedData.status}`;
    } else if (priceChanged) {
      updateType = 'ITEM_UPDATE';
      description = 'Item prices updated';
    } else if (itemsChanged) {
      updateType = 'ITEM_UPDATE';
      description = 'Items updated';
    }
    
    await new PurchaseOrderHistory({
      purchaseOrder: id,
      updatedBy: user._id,
      updateType,
      description,
      previousValues,
      newValues: updatedData,
      changes: {
        statusChanged,
        itemsChanged,
        priceChanged,
        priceChangeDetails
      }
    }).save();

    res.status(200).json({ 
      success: true, 
      message: "Purchase order updated successfully", 
      updatedPurchaseOrder 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating purchase order: " + error.message 
    });
  }
};