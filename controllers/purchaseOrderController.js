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

    // Validate payment terms
    if (poData.paymentTerms) {
      const { advance, payAgainstDelivery, payAfterCompletion } = poData.paymentTerms;
      const totalPayment = Number(advance) + Number(payAgainstDelivery) + Number(payAfterCompletion);
      
      if (totalPayment > 100) {
        return res.status(400).json({ 
          success: false, 
          error: "The total payment percentage cannot exceed 100%" 
        });
      }
    }

    // Create new purchase order
    const newPurchaseOrder = new PurchaseOrder({
      ...poData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    // Save with retry logic for duplicate key errors
    let savedPO = null;
    let retryCount = 0;
    const maxRetries = 3;

    while (!savedPO && retryCount < maxRetries) {
      try {
        savedPO = await newPurchaseOrder.save();
      } catch (saveError) {
        if (saveError.code === 11000 && saveError.keyPattern && saveError.keyPattern.orderNumber) {
          // Duplicate key error for orderNumber, regenerate and retry
          console.log(`Duplicate order number detected, retrying... (Attempt ${retryCount + 1}/${maxRetries})`);
          
          // Clear the order number to trigger regeneration
          newPurchaseOrder.orderNumber = undefined;
          retryCount++;
          
          if (retryCount >= maxRetries) {
            throw saveError;
          }
        } else {
          throw saveError; // Re-throw if it's not a duplicate key error
        }
      }
    }

    if (savedPO) {
      // Create history record
      await new PurchaseOrderHistory({
        purchaseOrder: savedPO._id,
        updatedBy: user._id,
        updateType: 'CREATE',
        description: 'Purchase order created',
        newValues: { ...poData, orderNumber: savedPO.orderNumber }
      }).save();
      
      res.status(201).json({
        success: true,
        message: "Purchase order created successfully",
        orderNumber: savedPO.orderNumber
      });
    }
  } catch (error) {
    console.error("Error creating purchase order:", error);
    
    if (error.code === 11000) {
      res.status(409).json({ 
        success: false, 
        error: "Duplicate order number generated. Please try again." 
      });
    } else if (error.name === "ValidationError") {
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

    // Validate payment terms
    if (updatedData.paymentTerms) {
      const { advance, payAgainstDelivery, payAfterCompletion } = updatedData.paymentTerms;
      const totalPayment = Number(advance) + Number(payAgainstDelivery) + Number(payAfterCompletion);
      
      if (totalPayment > 100) {
        return res.status(400).json({ 
          success: false, 
          error: "The total payment percentage cannot exceed 100%" 
        });
      }
    }

    // Store previous values for history
    const previousValues = { ...existingPO._doc };
    
    // Check if status is being changed
    const statusChanged = existingPO.status !== updatedData.status;
    
    // Check if items are being updated
    const itemsChanged = JSON.stringify(existingPO.items) !== JSON.stringify(updatedData.items);
    
    // Check if payment terms are being updated
    const paymentTermsChanged = JSON.stringify(existingPO.paymentTerms) !== JSON.stringify(updatedData.paymentTerms);

    // Update purchase order
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
    } else if (paymentTermsChanged) {
      updateType = 'PAYMENT_TERMS_UPDATE';
      description = 'Payment terms updated';
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
        paymentTermsChanged
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