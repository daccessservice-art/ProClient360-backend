const express = require('express');
const { permissionMiddleware } = require('../middlewares/auth');
const { showAll, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, getPurchaseOrder, getPurchaseOrderHistory } = require('../controllers/purchaseOrderController');
const upload = require('../middlewares/fileUpload');
const { bucket } = require('../utils/firebase');
const PurchaseOrder = require('../models/purchaseOrderModel');
const PurchaseOrderHistory = require('../models/purchaseOrderHistoryModel');

const router = express.Router();

router.get('/', permissionMiddleware(['viewPurchaseOrder']), showAll);
router.get('/:id', permissionMiddleware(['viewPurchaseOrder']), getPurchaseOrder);
router.get('/:id/history', permissionMiddleware(['viewPurchaseOrder']), getPurchaseOrderHistory);

router.post('/upload', permissionMiddleware(['createPurchaseOrder']), upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    const poData = JSON.parse(req.body.poData);
    const user = req.user;

    if (file) {
      const fileName = `purchaseOrders/${Date.now()}_${file.originalname}`;
      const fileUpload = bucket.file(fileName);
      
      await fileUpload.save(file.buffer, {
        metadata: { contentType: file.mimetype }
      });
      
      await fileUpload.makePublic();
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      
      // Add file URL to attachments
      poData.attachments = [fileUrl];
    }

    // Create purchase order
    const newPurchaseOrder = new PurchaseOrder({
      ...poData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

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
  } catch (error) {
    console.error("Error creating PO with file:", error);
    res.status(500).json({ 
      success: false,
      error: "Error creating purchase order: " + error.message 
    });
  }
});

// NEW: File upload route for UPDATE
router.put('/upload/:id', permissionMiddleware(['updatePurchaseOrder']), upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { file } = req;
    const poData = JSON.parse(req.body.poData);
    const user = req.user;

    // Find existing purchase order
    const existingPO = await PurchaseOrder.findById(id);
    if (!existingPO) {
      return res.status(404).json({ 
        success: false, 
        error: "Purchase order not found" 
      });
    }

    // Handle file upload to Firebase
    if (file) {
      const fileName = `purchaseOrders/${Date.now()}_${file.originalname}`;
      const fileUpload = bucket.file(fileName);
      
      await fileUpload.save(file.buffer, {
        metadata: { contentType: file.mimetype }
      });
      
      await fileUpload.makePublic();
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      
      // Add new file URL to attachments (keep existing ones)
      poData.attachments = [...(existingPO.attachments || []), fileUrl];
    }

    // Store previous values for history
    const previousValues = { ...existingPO._doc };
    
    // Check for changes
    const statusChanged = existingPO.status !== poData.status;
    const itemsChanged = JSON.stringify(existingPO.items) !== JSON.stringify(poData.items);
    
    // Update purchase order
    const updatedPurchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      id, 
      poData, 
      { new: true, runValidators: true }
    );

    // Create history record
    let updateType = 'UPDATE';
    let description = 'Purchase order updated';
    
    if (statusChanged) {
      updateType = 'STATUS_CHANGE';
      description = `Status changed from ${existingPO.status} to ${poData.status}`;
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
      newValues: poData,
      changes: {
        statusChanged,
        itemsChanged
      }
    }).save();

    res.status(200).json({ 
      success: true, 
      message: "Purchase order updated successfully", 
      updatedPurchaseOrder 
    });
  } catch (error) {
    console.error("Error updating PO with file:", error);
    res.status(500).json({
      success: false, 
      error: "Error updating purchase order: " + error.message 
    });
  }
});

// Existing routes (without file upload)
router.post('/', permissionMiddleware(['createPurchaseOrder']), createPurchaseOrder);
router.put('/:id', permissionMiddleware(['updatePurchaseOrder']), updatePurchaseOrder);
router.delete('/:id', permissionMiddleware(['deletePurchaseOrder']), deletePurchaseOrder);

module.exports = router;