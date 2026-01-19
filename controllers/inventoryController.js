const Inventory = require('../models/inventoryModel');

exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;
    
    const { q, category, stockStatus } = req.query;
    
    console.log("Query parameters:", { q, category, stockStatus });
    
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
        { materialCode: { $regex: searchRegex } },
        { productName: { $regex: searchRegex } },
        { materialName: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ];
    }
    
    // Add category filter if provided
    if (category !== undefined &&
      category !== null &&
      category.trim() !== "" &&
      category.trim().toLowerCase() !== "null" &&
      category.trim().toLowerCase() !== "undefined") {
      
      query.category = category;
    }
    
    // Add stock status filter if provided
    if (stockStatus !== undefined &&
      stockStatus !== null &&
      stockStatus.trim() !== "" &&
      stockStatus.trim().toLowerCase() !== "null" &&
      stockStatus.trim().toLowerCase() !== "undefined") {
      
      if (stockStatus === 'out-of-stock') {
        query.currentStock = 0;
      } else if (stockStatus === 'low-stock') {
        query.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
      } else if (stockStatus === 'in-stock') {
        query.$expr = { $gt: ['$currentStock', '$minStockLevel'] };
      }
    }
    
    console.log("Final query:", JSON.stringify(query));
    
    const inventory = await Inventory.find(query)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name')
      .populate('transactions.by', 'name')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log("Found inventory items:", inventory.length);
    
    if (inventory.length <= 0) {
      return res.status(200).json({ success: true, data: [], pagination: {
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        limit,
        hasNextPage: false,
        hasPrevPage: false,
      } });
    }
    
    const totalRecords = await Inventory.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.status(200).json({
      success: true,
      data: inventory,
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
    res.status(500).json({ success: false, error: "Error while fetching inventory: " + error.message });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const inventory = await Inventory.findOne({
      _id: id,
      company: user.company ? user.company : user._id
    })
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .populate('transactions.by', 'name email');
    
    if (!inventory) {
      return res.status(404).json({ success: false, error: "Inventory item not found" });
    }
    
    res.status(200).json({ success: true, data: inventory });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error in getting inventory item: " + error.message });
  }
};

exports.search = async (req, res) => {
  try {
    const user = req.user;
    const query = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const filter = {
      company: user.company ? user.company : user._id,
      $or: [
        { materialCode: { $regex: query, $options: 'i' } },
        { productName: { $regex: query, $options: 'i' } },
        { materialName: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };
    
    const inventory = await Inventory.find(filter)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name');
    
    if (inventory.length <= 0) {
      return res.status(200).json({ success: true, data: [], pagination: {
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        limit,
        hasNextPage: false,
        hasPrevPage: false,
      } });
    }
    
    const totalRecords = await Inventory.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: inventory,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        totalRecords,
        hasNextPage: page < Math.ceil(totalRecords / limit),
        hasPrevPage: page > 1,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while searching inventory: " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      // Basic inventory fields
      materialCode,
      materialName,
      category,
      unitPrice,
      currentStock,
      minStockLevel,
      warehouseLocation,
      stockLocation,
      openingDate, // New field
      description,
      
      // Product fields
      productName,
      brandName,
      model,
      hsnCode,
      productCategory,
      baseUOM,
      uomConversion,
      mrp,
      salesPrice,
      purchasePrice,
      minQtyLevel,
      discountType,
      discountValue,
      
      // Tax fields
      taxType,
      gstRate,
      gstEffectiveDate,
      
      // Timestamp (if provided, otherwise use current time)
      createdAt
    } = req.body;
    
    // Check if material code already exists
    const existingInventory = await Inventory.findOne({ materialCode });
    if (existingInventory) {
      return res.status(409).json({ success: false, error: "Material with this code already exists" });
    }
    
    // Create new inventory item
    const newInventory = new Inventory({
      // Basic inventory fields
      materialCode,
      materialName,
      category,
      unitPrice,
      currentStock,
      minStockLevel,
      warehouseLocation,
      stockLocation,
      openingDate, // New field
      description,
      
      // Product fields
      productName,
      brandName,
      model,
      hsnCode,
      productCategory,
      baseUOM,
      uomConversion,
      mrp,
      salesPrice,
      purchasePrice,
      minQtyLevel,
      discountType,
      discountValue,
      
      // Tax fields
      taxType,
      gstRate,
      gstEffectiveDate,
      
      // Company and user references
      company: req.user.company || req.user._id,
      createdBy: req.user._id,
      
      // Timestamp (if provided, otherwise use current time)
      createdAt: createdAt || new Date()
    });
    
    if (newInventory) {
      await newInventory.save();
      res.status(201).json({
        success: true,
        message: `Material ${materialCode} has been created successfully`,
        data: newInventory
      });
    } else {
      res.status(400).json({
        success: false,
        error: "Invalid inventory data"
      });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: "Error while creating inventory item: " + error.message });
  }
};

exports.deleteInventory = async (req, res) => {
  try {
    const id = req.params.id;
    const user = req.user;
    
    const inventory = await Inventory.findOne({ 
      _id: id,
      company: user.company ? user.company : user._id 
    });
    
    if (!inventory) {
      return res.status(404).json({ success: false, error: "Inventory item not found" });
    }
    
    await Inventory.findByIdAndDelete(id);
    
    res.status(200).json({ 
      success: true, 
      message: `Material ${inventory.materialCode} has been deleted successfully` 
    });
  } catch (error) {
    res.status(400).json({ success: false, error: "Error while deleting inventory item: " + error.message });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const originalData = await Inventory.findOne({
      _id: id,
      company: user.company ? user.company : user._id
    });
    
    if (!originalData) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    const {
      // Basic inventory fields
      materialCode,
      materialName,
      category,
      unitPrice,
      currentStock,
      minStockLevel,
      warehouseLocation,
      stockLocation,
      openingDate, // New field
      description,
      
      // Product fields
      productName,
      brandName,
      model,
      hsnCode,
      productCategory,
      baseUOM,
      uomConversion,
      mrp,
      salesPrice,
      purchasePrice,
      minQtyLevel,
      discountType,
      discountValue,
      
      // Tax fields
      taxType,
      gstRate,
      gstEffectiveDate,
      
      // Transaction fields
      transaction
    } = req.body;
    
    // Check if material code already exists (if it's being changed)
    if (materialCode && materialCode !== originalData.materialCode) {
      const existingInventory = await Inventory.findOne({ materialCode });
      if (existingInventory) {
        return res.status(409).json({ success: false, error: "Material with this code already exists" });
      }
    }
    
    const updateData = {
      // Basic inventory fields
      materialCode,
      materialName,
      category,
      unitPrice,
      minStockLevel,
      warehouseLocation,
      stockLocation,
      openingDate, // New field
      description,
      
      // Product fields
      productName,
      brandName,
      model,
      hsnCode,
      productCategory,
      baseUOM,
      uomConversion,
      mrp,
      salesPrice,
      purchasePrice,
      minQtyLevel,
      discountType,
      discountValue,
      
      // Tax fields
      taxType,
      gstRate,
      gstEffectiveDate,
      
      // User reference
      lastUpdatedBy: req.user._id
    };
    
    // Handle stock update with transaction
    if (transaction && transaction.quantity) {
      const transactionQty = parseInt(transaction.quantity);
      let newStock;
      
      if (transaction.type === 'incoming') {
        newStock = originalData.currentStock + transactionQty;
      } else if (transaction.type === 'outgoing') {
        newStock = originalData.currentStock - transactionQty;
        
        // Validate outgoing quantity
        if (newStock < 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'Outgoing quantity cannot exceed current stock' 
          });
        }
      }
      
      updateData.currentStock = newStock;
      
      // Add transaction to history
      const transactionRecord = {
        type: transaction.type,
        quantity: transactionQty,
        reason: transaction.reason,
        date: transaction.date || new Date(),
        by: req.user._id
      };
      
      // Push transaction to history
      await Inventory.findByIdAndUpdate(
        id, 
        { 
          $set: updateData,
          $push: { transactions: transactionRecord }
        }, 
        { runValidators: true, new: true }
      );
    } else {
      // Regular update without transaction
      if (currentStock !== undefined) {
        updateData.currentStock = currentStock;
      }
      
      // Remove undefined fields
      Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
      
      await Inventory.findByIdAndUpdate(id, { $set: updateData }, { runValidators: true });
    }
    
    res.status(200).json({
      success: true,
      message: 'Inventory item updated successfully'
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false, error: 'Error while updating inventory item: ' + error.message });
  }
};

// Get low stock items
exports.getLowStockItems = async (req, res) => {
  try {
    const user = req.user;
    
    const lowStockItems = await Inventory.find({
      company: user.company ? user.company : user._id,
      $expr: { $lte: ['$currentStock', '$minStockLevel'] }
    })
      .populate('createdBy', 'name')
      .sort({ currentStock: 1 });
    
    res.status(200).json({
      success: true,
      data: lowStockItems,
      count: lowStockItems.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching low stock items: " + error.message });
  }
};

// Get inventory by category
exports.getInventoryByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const user = req.user;
    
    const inventory = await Inventory.find({
      company: user.company ? user.company : user._id,
      category: category
    })
      .populate('createdBy', 'name')
      .sort({ materialName: 1 });
    
    res.status(200).json({
      success: true,
      data: inventory,
      count: inventory.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching inventory by category: " + error.message });
  }
};

// Get transaction history for an item
exports.getTransactionHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    
    const inventory = await Inventory.findOne({
      _id: id,
      company: user.company ? user.company : user._id
    })
      .select('transactions')
      .populate('transactions.by', 'name email');
    
    if (!inventory) {
      return res.status(404).json({ success: false, error: "Inventory item not found" });
    }
    
    res.status(200).json({
      success: true,
      data: inventory.transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching transaction history: " + error.message });
  }
};