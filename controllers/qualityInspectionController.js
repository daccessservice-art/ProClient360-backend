// controllers/qualityInspectionController.js
const QualityInspection = require("../models/qualityInspectionModel");

function generateAssetsForItem(qcDoc, item) {
  const assets = [];
  const boxes = [];
  const qcOkQty = item.qcOkQuantity || 0;
  
  if (qcOkQty <= 0) return { assets, boxes };
  
  const itemsPerBox = item.itemsPerBox || 1;
  const warrantyMonths = item.serviceWarrantyMonths || 0;
  const inDate = new Date(qcDoc.qcDate);
  const frontendUrl = process.env.FRONTEND_URL || 'https://proclient360.com';

  let warrantyExpiryDate = null;
  if (warrantyMonths > 0) {
    warrantyExpiryDate = new Date(inDate);
    warrantyExpiryDate.setMonth(warrantyExpiryDate.getMonth() + warrantyMonths);
  }

  const totalBoxes = Math.ceil(qcOkQty / itemsPerBox);
  let assetSerial = 1;

  for (let boxNum = 1; boxNum <= totalBoxes; boxNum++) {
    const boxNumber = itemsPerBox > 1 ? `Box-${boxNum}` : null;
    const itemsInThisBox = boxNum === totalBoxes 
      ? qcOkQty - (boxNum - 1) * itemsPerBox 
      : itemsPerBox;

    if (itemsPerBox > 1) {
      const boxId = `BOX-${qcDoc.qcNumber.replace(/\//g, '-')}-${boxNum}`;
      boxes.push({
        boxNumber,
        boxQrCodeData: `${frontendUrl}/asset/${boxId}`,
        assetCount: itemsInThisBox,
        brandName: item.brandName || '',
        modelNo: item.modelNo || '',
      });
    }

    for (let itemInBox = 1; itemInBox <= itemsInThisBox; itemInBox++) {
      const brandPrefix = (item.brandName || 'XXX').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
      const assetId = `${qcDoc.qcNumber.replace(/\//g, '-')}-${brandPrefix}-${String(assetSerial).padStart(4, '0')}`;

      assets.push({
        assetId,
        qrCodeData: `${frontendUrl}/asset/${assetId}`,
        brandName: item.brandName || '',
        modelNo: item.modelNo || '',
        unit: item.unit || 'No.',
        inDate,
        outDate: null,
        serviceWarrantyMonths: warrantyMonths,
        warrantyExpiryDate,
        status: 'In Warehouse',
        boxNumber,
      });

      assetSerial++;
    }
  }

  return { assets, boxes };
}

function isQualityEngineer(user) {
  return user?.user === 'company' || user?.permissions?.includes('updateQC');
}

function filterAssetForPublic(asset) {
  const now = new Date();
  const warrantyExpiryDate = asset.warrantyExpiryDate ? new Date(asset.warrantyExpiryDate) : null;
  
  return {
    assetId: asset.assetId,
    brandName: asset.brandName,
    modelNo: asset.modelNo,
    unit: asset.unit || 'No.',
    inDate: asset.inDate,
    outDate: asset.outDate,
    status: asset.status,
    serviceWarrantyMonths: asset.serviceWarrantyMonths || 0,
    warrantyExpiryDate: asset.warrantyExpiryDate,
    isWarrantyExpired: warrantyExpiryDate ? now > warrantyExpiryDate : false,
    hasWarranty: (asset.serviceWarrantyMonths || 0) > 0,
    isDispatched: asset.status === 'Dispatched' || asset.status === 'In Service',
    warrantyDaysRemaining: warrantyExpiryDate ? Math.ceil((warrantyExpiryDate - now) / (1000 * 60 * 60 * 24)) : null,
    boxNumber: asset.boxNumber,
  };
}

function filterAssetForViewOnly(asset, qcInfo) {
  return {
    ...asset,
    qcNumber: qcInfo.qcNumber,
    grnNumber: qcInfo.grnNumber,
    canUpdate: false,
  };
}

function filterAssetForQE(asset, qcInfo) {
  return {
    ...asset,
    qcNumber: qcInfo.qcNumber,
    grnNumber: qcInfo.grnNumber,
    qcDate: qcInfo.qcDate,
    canUpdate: true,
  };
}

// Parse Box ID: BOX-QC-YYYY-YY-NNN-N -> QC/YYYY-YY/NNN, Box-N
function parseBoxId(boxId) {
  const withoutPrefix = boxId.replace(/^BOX-/, '');
  const parts = withoutPrefix.split('-');
  
  if (parts.length < 5) return null;
  
  const boxNum = parseInt(parts[parts.length - 1]);
  if (isNaN(boxNum)) return null;
  
  const year1 = parts[1];
  const year2 = parts[2];
  const serial = parts[3];
  
  const qcNumber = `QC/${year1}-${year2}/${serial}`;
  
  return {
    qcNumber,
    boxNum,
    boxNumber: `Box-${boxNum}`
  };
}

exports.getQualityInspection = async (req, res) => {
  try {
    const qc = await QualityInspection.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName');

    if (!qc) return res.status(404).json({ success: false, error: "Quality inspection not found" });

    res.status(200).json({ success: true, message: "Quality inspection fetched successfully", qc });
  } catch (error) {
    res.status(500).json({ error: "Error in getting quality inspection: " + error.message });
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

    if (q && q.trim() !== "" && q.trim().toLowerCase() !== "null" && q.trim().toLowerCase() !== "undefined") {
      const searchRegex = new RegExp(q, "i");
      skip = 0; page = 1;
      query = {
        company: user.company ? user.company : user._id,
        $or: [
          { qcNumber: { $regex: searchRegex } },
          { grnNumber: { $regex: searchRegex } },
        ],
      };
    } else {
      query = { company: user.company || user._id };
    }

    const qualityInspections = await QualityInspection.find(query)
      .skip(skip).limit(limit)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 }).lean();

    if (qualityInspections.length === 0) {
      return res.status(404).json({ success: false, error: "No quality inspections found" });
    }

    const totalQCs = await QualityInspection.countDocuments(query);
    const totalPages = Math.ceil(totalQCs / limit);

    res.status(200).json({
      success: true,
      qualityInspections,
      pagination: { currentPage: page, totalPages, totalQCs, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while fetching quality inspections: " + error.message });
  }
};

exports.createQualityInspection = async (req, res) => {
  try {
    const user = req.user;
    const qcData = req.body;

    if (!qcData.items || qcData.items.length === 0) {
      return res.status(400).json({ success: false, error: "At least one item is required" });
    }

    for (const item of qcData.items) {
      const total = (item.qcOkQuantity || 0) + (item.faultyQuantity || 0);
      if (total !== item.receivedQuantity) {
        return res.status(400).json({ 
          success: false, 
          error: `QC OK + Faulty must equal received quantity for ${item.brandName} ${item.modelNo}` 
        });
      }
    }

    const itemsWithoutAssets = qcData.items.map(item => ({
      brandName: item.brandName,
      modelNo: item.modelNo,
      receivedQuantity: item.receivedQuantity,
      unit: item.unit,
      baseUOM: item.baseUOM || '',
      qcOkQuantity: item.qcOkQuantity,
      faultyQuantity: item.faultyQuantity,
      remark: item.remark || '',
      itemsPerBox: item.itemsPerBox || 1,
      serviceWarrantyMonths: item.serviceWarrantyMonths || 0,
      assets: [],
      boxes: [],
    }));

    const newQC = new QualityInspection({
      qcDate: qcData.qcDate,
      grnNumber: qcData.grnNumber,
      items: itemsWithoutAssets,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
      status: 'Completed',
      totalAssets: 0,
      totalBoxes: 0,
    });

    await newQC.save();

    let totalAssets = 0;
    let totalBoxes = 0;

    const itemsWithAssets = newQC.items.map(item => {
      const plain = item.toObject();
      if (item.qcOkQuantity > 0) {
        const { assets, boxes } = generateAssetsForItem(newQC, item);
        plain.assets = assets;
        plain.boxes = boxes;
        totalAssets += assets.length;
        totalBoxes += boxes.length;
      } else {
        plain.assets = [];
        plain.boxes = [];
      }
      return plain;
    });

    await QualityInspection.findByIdAndUpdate(
      newQC._id,
      { $set: { items: itemsWithAssets, totalAssets, totalBoxes } },
      { runValidators: false }
    );

    const finalQC = await QualityInspection.findById(newQC._id)
      .populate('createdBy', 'name email')
      .populate('company', 'name');

    res.status(201).json({
      success: true,
      message: "Quality inspection created successfully with assets",
      qualityInspection: finalQC,
    });
  } catch (error) {
    console.error("Error in createQualityInspection:", error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      res.status(400).json({ 
        success: false, 
        error: `Duplicate value for ${field}: ${value}. Please try again.` 
      });
    } else if (error.name === "ValidationError") {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: "Error creating quality inspection: " + error.message });
    }
  }
};

exports.deleteQualityInspection = async (req, res) => {
  try {
    const qc = await QualityInspection.findByIdAndDelete(req.params.id);
    if (!qc) return res.status(404).json({ success: false, error: "Quality inspection not found" });
    res.status(200).json({ success: true, message: "Quality inspection deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while deleting quality inspection: " + error.message });
  }
};

exports.updateQualityInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const existingQC = await QualityInspection.findById(id);

    if (!existingQC) return res.status(404).json({ success: false, error: "Quality inspection not found" });

    if (updatedData.items) {
      let totalAssets = 0;
      let totalBoxes = 0;
      
      for (let i = 0; i < updatedData.items.length; i++) {
        const item = updatedData.items[i];
        const existingItem = existingQC.items[i];

        if (!existingItem) continue;

        let currentAssets = [...(existingItem.assets || [])];

        const newOutDate = item.outDate ? new Date(item.outDate) : null;
        const existingOutDate = existingItem.outDate ? new Date(existingItem.outDate) : null;
        
        if (newOutDate && (!existingOutDate || newOutDate.getTime() !== existingOutDate.getTime())) {
          for (const asset of currentAssets) {
            if (asset.status === 'In Warehouse') {
              asset.outDate = newOutDate;
              asset.status = 'Dispatched';
            }
          }
        }

        if (item.qcOkQuantity !== existingItem.qcOkQuantity ||
            item.serviceWarrantyMonths !== existingItem.serviceWarrantyMonths ||
            item.itemsPerBox !== existingItem.itemsPerBox) {
          
          const existingDispatched = currentAssets.filter(a => 
            a.status === 'Dispatched' || a.status === 'In Service'
          );
          
          const newAssetsNeeded = item.qcOkQuantity - existingDispatched.length;
          
          if (newAssetsNeeded > 0) {
            const tempQC = { ...existingQC.toObject(), items: [{ ...item, outDate: null }] };
            const { assets, boxes } = generateAssetsForItem(tempQC, item);
            
            if (newOutDate) {
              for (const asset of assets) {
                asset.outDate = newOutDate;
                asset.status = 'Dispatched';
              }
            }
            
            currentAssets = [...existingDispatched, ...assets.slice(0, newAssetsNeeded)];
          } else if (newAssetsNeeded < 0) {
            currentAssets = existingDispatched.slice(0, item.qcOkQuantity);
          }
          
          const itemsPerBox = item.itemsPerBox || 1;
          if (itemsPerBox > 1 && currentAssets.length > 0) {
            const tempQC = { ...existingQC.toObject(), items: [{ ...item, qcOkQuantity: currentAssets.length }] };
            const { boxes } = generateAssetsForItem(tempQC, item);
            item.boxes = boxes;
          } else {
            item.boxes = [];
          }
        } else {
          item.boxes = existingItem.boxes || [];
        }

        item.assets = currentAssets;
        item.outDate = newOutDate;
        
        totalAssets += item.assets?.length || 0;
        totalBoxes += item.boxes?.length || 0;
      }
      updatedData.totalAssets = totalAssets;
      updatedData.totalBoxes = totalBoxes;
    }

    const updatedQC = await QualityInspection.findByIdAndUpdate(id, updatedData, { new: true, runValidators: false })
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName');

    res.status(200).json({ success: true, message: "Quality inspection updated successfully", updatedQC });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating quality inspection: " + error.message });
  }
};

exports.getAssetByQR = async (req, res) => {
  try {
    const { qrData } = req.params;
    const user = req.user;
    let assetId = qrData;
    let isBoxRequest = false;

    if (qrData.startsWith('BOX-')) {
      isBoxRequest = true;
    } else {
      try {
        const parsed = JSON.parse(decodeURIComponent(qrData));
        if (parsed.assetId) assetId = parsed.assetId;
        if (parsed.assetId?.startsWith('BOX-')) isBoxRequest = true;
      } catch {
        if (qrData.startsWith('http')) {
          const lastSegment = qrData.split('/').pop();
          if (lastSegment.startsWith('BOX-')) {
            isBoxRequest = true;
            assetId = lastSegment;
          } else {
            assetId = lastSegment;
          }
        }
      }
    }

    if (isBoxRequest) {
      const parsedBox = parseBoxId(assetId);
      
      if (!parsedBox) {
        return res.status(400).json({ success: false, error: "Invalid Box ID format" });
      }

      const qcByNumber = await QualityInspection.findOne({ 
        qcNumber: parsedBox.qcNumber,
        company: user.company || user._id
      })
        .populate('company', 'name')
        .lean();

      if (!qcByNumber) {
        return res.status(404).json({ success: false, error: "Box not found" });
      }

      let boxAssets = [];
      let boxInfo = null;
      let itemInfo = null;

      for (const item of qcByNumber.items) {
        const foundBox = item.boxes?.find(b => b.boxNumber === parsedBox.boxNumber);
        if (foundBox) {
          boxInfo = foundBox;
          itemInfo = { brandName: item.brandName, modelNo: item.modelNo, unit: item.unit };
          // Get all assets that belong to this box
          boxAssets = (item.assets || []).filter(a => a.boxNumber === parsedBox.boxNumber);
          break;
        }
      }

      if (!boxInfo) {
        return res.status(404).json({ success: false, error: "Box not found in QC items" });
      }

      const isQE = isQualityEngineer(user);
      
      let filteredAssets;
      if (isQE) {
        filteredAssets = boxAssets.map(a => filterAssetForQE(a, qcByNumber));
      } else {
        filteredAssets = boxAssets.map(a => filterAssetForViewOnly(a, qcByNumber));
      }

      return res.status(200).json({
        success: true,
        message: "Box found",
        isBox: true,
        box: {
          boxNumber: boxInfo.boxNumber,
          boxQrCodeData: boxInfo.boxQrCodeData,
          assetCount: boxInfo.assetCount,
          brandName: boxInfo.brandName,
          modelNo: boxInfo.modelNo,
        },
        itemInfo,
        assets: filteredAssets,
        qcNumber: qcByNumber.qcNumber,
        grnNumber: qcByNumber.grnNumber,
        qcDate: qcByNumber.qcDate,
        companyName: qcByNumber.company?.name,
        canUpdate: isQE,
        showInDate: isQE,
      });
    }

    // Asset QR scan
    const qc = await QualityInspection.findOne({
      company: user.company || user._id,
      'items.assets.assetId': assetId
    })
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName')
      .lean();

    if (!qc) return res.status(404).json({ success: false, error: "Asset not found in QC" });

    let asset = null, itemInfo = null;
    for (const item of qc.items) {
      const found = item.assets?.find(a => a.assetId === assetId);
      if (found) { 
        asset = found; 
        itemInfo = { 
          brandName: item.brandName, 
          modelNo: item.modelNo, 
          receivedQuantity: item.receivedQuantity, 
          unit: item.unit, 
          qcOkQuantity: item.qcOkQuantity 
        }; 
        break; 
      }
    }

    if (!asset) return res.status(404).json({ success: false, error: "Asset not found in QC" });

    if (asset.warrantyExpiryDate && new Date() > new Date(asset.warrantyExpiryDate) && asset.status !== 'Warranty Expired') {
      await QualityInspection.updateOne(
        { 'items.assets.assetId': assetId },
        { $set: { 'items.$.assets.$[elem].status': 'Warranty Expired' } },
        { arrayFilters: [{ 'elem.assetId': assetId }] }
      );
      asset.status = 'Warranty Expired';
    }

    const isQE = isQualityEngineer(user);
    let filteredAsset;
    
    if (isQE) {
      filteredAsset = filterAssetForQE(asset, qc);
    } else {
      filteredAsset = filterAssetForViewOnly(asset, qc);
    }

    res.status(200).json({ 
      success: true, 
      message: "Asset found", 
      isBox: false,
      asset: filteredAsset,
      itemInfo,
      canUpdate: isQE,
      showInDate: isQE,
    });
  } catch (error) {
    console.error('Error in getAssetByQR:', error);
    res.status(500).json({ error: "Error fetching asset: " + error.message });
  }
};

exports.getPublicAssetByAssetId = async (req, res) => {
  try {
    const { assetId } = req.params;

    const isBoxRequest = assetId.startsWith('BOX-');

    if (isBoxRequest) {
      const parsedBox = parseBoxId(assetId);
      
      if (!parsedBox) {
        return res.status(400).json({ success: false, error: "Invalid Box ID format" });
      }

      const qc = await QualityInspection.findOne({ qcNumber: parsedBox.qcNumber }).lean();
      
      if (!qc) {
        return res.status(404).json({ success: false, error: "Box not found" });
      }

      let boxInfo = null;
      let boxAssets = [];

      for (const item of qc.items) {
        const foundBox = item.boxes?.find(b => b.boxNumber === parsedBox.boxNumber);
        if (foundBox) {
          boxInfo = foundBox;
          itemInfo = { brandName: item.brandName, modelNo: item.modelNo, unit: item.unit };
          // Get all assets inside this box
          boxAssets = (item.assets || []).filter(a => a.boxNumber === parsedBox.boxNumber);
          break;
        }
      }

      if (!boxInfo) {
        return res.status(404).json({ success: false, error: "Box not found in QC" });
      }

      return res.status(200).json({
        success: true,
        isBox: true,
        isPublic: true,
        qcNumber: qc.qcNumber,
        grnNumber: qc.grnNumber,
        qcDate: qc.qcDate,
        box: {
          boxNumber: boxInfo.boxNumber,
          boxQrCodeData: boxInfo.boxQrCodeData,
          assetCount: boxInfo.assetCount,
          brandName: boxInfo.brandName,
          modelNo: boxInfo.modelNo,
        },
        itemInfo,
        assets: boxAssets.map(a => filterAssetForPublic(a)),
      });
    }

    // Individual asset request
    const qc = await QualityInspection.findOne({ 'items.assets.assetId': assetId }).lean();
    
    if (!qc) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    let asset = null;
    let itemInfo = null;
    for (const item of qc.items) {
      const found = item.assets?.find(a => a.assetId === assetId);
      if (found) { 
        asset = found; 
        itemInfo = { brandName: item.brandName, modelNo: item.modelNo };
        break; 
      }
    }

    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    res.status(200).json({
      success: true,
      isBox: false,
      isPublic: true,
      qcNumber: qc.qcNumber,
      grnNumber: qc.grnNumber,
      itemInfo,
      asset: filterAssetForPublic(asset),
    });
  } catch (error) {
    console.error('Error in getPublicAssetByAssetId:', error);
    res.status(500).json({ success: false, error: "Error fetching asset: " + error.message });
  }
};

exports.updateAssetStatus = async (req, res) => {
  try {
    const { qcId, assetId } = req.params;
    const { status, outDate, assignedTo, serviceNote } = req.body;
    const user = req.user;

    if (!isQualityEngineer(user)) {
      return res.status(403).json({ success: false, error: "Only Quality Engineer can update asset status" });
    }

    const qc = await QualityInspection.findById(qcId);
    if (!qc) return res.status(404).json({ success: false, error: "QC not found" });

    let assetFound = false;
    for (const item of qc.items) {
      for (const asset of item.assets) {
        if (asset.assetId === assetId) {
          if (status) asset.status = status;
          if (outDate) asset.outDate = new Date(outDate);
          if (assignedTo) asset.assignedTo = assignedTo;
          if (serviceNote) {
            asset.serviceHistory = asset.serviceHistory || [];
            asset.serviceHistory.push({ 
              date: new Date(), 
              description: serviceNote, 
              servicedBy: user?.name || 'System' 
            });
          }
          assetFound = true; 
          break;
        }
      }
      if (assetFound) break;
    }

    if (!assetFound) return res.status(404).json({ success: false, error: "Asset not found" });
    await qc.save();
    res.status(200).json({ success: true, message: "Asset status updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error updating asset status: " + error.message });
  }
};

exports.getAllAssets = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { q, status, warrantyStatus } = req.query;
    let baseQuery = { company: user.company || user._id, 'items.assets.0': { $exists: true } };

    if (q && q.trim() !== "" && q.toLowerCase() !== "null" && q.toLowerCase() !== "undefined") {
      const searchRegex = new RegExp(q, "i");
      baseQuery.$or = [
        { qcNumber: { $regex: searchRegex } }, 
        { grnNumber: { $regex: searchRegex } },
        { 'items.assets.assetId': { $regex: searchRegex } }, 
        { 'items.brandName': { $regex: searchRegex } },
        { 'items.modelNo': { $regex: searchRegex } },
      ];
    }

    const qcs = await QualityInspection.find(baseQuery).skip(skip).limit(limit)
      .populate('createdBy', 'name email').populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName').sort({ createdAt: -1 }).lean();

    let allAssets = [];
    const isQE = isQualityEngineer(user);

    for (const qc of qcs) {
      for (const item of qc.items) {
        if (item.assets?.length > 0) {
          for (const asset of item.assets) {
            if (!asset.assetId) continue;
            
            if (status && status !== 'All' && asset.status !== status) continue;
            if (warrantyStatus) {
              const now = new Date();
              if (warrantyStatus === 'Active' && (!asset.warrantyExpiryDate || now > new Date(asset.warrantyExpiryDate))) continue;
              if (warrantyStatus === 'Expired' && (!asset.warrantyExpiryDate || now <= new Date(asset.warrantyExpiryDate))) continue;
              if (warrantyStatus === 'No Warranty' && asset.serviceWarrantyMonths > 0) continue;
            }

            const assetData = {
              ...asset, 
              qcNumber: qc.qcNumber, 
              qcId: qc._id, 
              grnNumber: qc.grnNumber, 
              qcDate: qc.qcDate, 
              brandName: item.brandName, 
              modelNo: item.modelNo, 
              companyName: qc.company?.name,
              canUpdate: isQE,
              showInDate: isQE,
            };

            if (!isQE) {
              delete assetData.inDate;
            }

            allAssets.push(assetData);
          }
        }
      }
    }

    const totalQCs = await QualityInspection.countDocuments(baseQuery);
    res.status(200).json({ 
      success: true, 
      assets: allAssets, 
      pagination: { 
        currentPage: page, 
        totalPages: Math.ceil(totalQCs / limit), 
        totalAssets: allAssets.length, 
        limit 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching assets: " + error.message });
  }
};