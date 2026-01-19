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
    console.error("Error creating PO with file:", error);
    
    if (error.code === 11000) {
      res.status(409).json({ 
        success: false, 
        error: "Duplicate order number generated. Please try again." 
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: "Error creating purchase order: " + error.message 
      });
    }
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
    const paymentTermsChanged = JSON.stringify(existingPO.paymentTerms) !== JSON.stringify(poData.paymentTerms);
    
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
      newValues: poData,
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