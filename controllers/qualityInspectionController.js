const QualityInspection = require("../models/qualityInspectionModel");

// ─── SINGLE source of truth for asset generation ─────────────────────────────
// Generates URL-based QR codes so mobile scanning opens the browser directly.
// This function is the ONLY place assets are created — the model's post-save
// hook has been removed to prevent duplicate assets (2 QR per item).
function generateAssetsForItem(qcDoc, item) {
  const assets = [];
  const qcOkQty = item.qcOkQuantity || 0;
  const itemsPerBox = item.itemsPerBox || 1;
  const warrantyMonths = item.serviceWarrantyMonths || 0;
  const inDate = new Date(qcDoc.qcDate);

  let warrantyExpiryDate = null;
  if (warrantyMonths > 0) {
    warrantyExpiryDate = new Date(inDate);
    warrantyExpiryDate.setMonth(warrantyExpiryDate.getMonth() + warrantyMonths);
  }

  const totalBoxes = Math.ceil(qcOkQty / itemsPerBox);
  let assetSerial = 1;

  // URL QR code — when scanned on mobile, opens the browser to the asset page
  const frontendUrl = process.env.FRONTEND_URL || 'https://proclient360.com';

  for (let boxNum = 1; boxNum <= totalBoxes; boxNum++) {
    const itemsInThisBox =
      boxNum === totalBoxes
        ? qcOkQty - (boxNum - 1) * itemsPerBox
        : itemsPerBox;

    for (let itemInBox = 1; itemInBox <= itemsInThisBox; itemInBox++) {
      const assetId = `${qcDoc.qcNumber.replace(/\//g, '-')}-${item.brandName
        .substring(0, 3)
        .toUpperCase()}-${String(assetSerial).padStart(4, '0')}`;

      // URL stored in QR — scanning with any phone camera opens the asset page
      const qrCodeData = `${frontendUrl}/asset/${assetId}`;

      assets.push({
        assetId,
        qrCodeData,
        brandName: item.brandName,
        modelNo: item.modelNo,
        unit: item.unit,
        inDate,
        outDate: null,
        serviceWarrantyMonths: warrantyMonths,
        warrantyExpiryDate,
        status: 'In Warehouse',
        boxNumber: itemsPerBox > 1 ? `Box-${boxNum}` : null,
      });

      assetSerial++;
    }
  }

  return assets;
}

exports.getQualityInspection = async (req, res) => {
  try {
    const qc = await QualityInspection.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName');

    if (!qc) {
      return res.status(404).json({ success: false, error: "Quality inspection not found" });
    }

    res.status(200).json({
      success: true,
      message: "Quality inspection fetched successfully",
      qc
    });
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
          { qcNumber: { $regex: searchRegex } },
          { grnNumber: { $regex: searchRegex } },
        ],
      };
    } else {
      query = { company: user.company || user._id };
    }

    const qualityInspections = await QualityInspection.find(query)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
      .lean();

    if (qualityInspections.length === 0) {
      return res.status(404).json({ success: false, error: "No quality inspections found" });
    }

    const totalQCs = await QualityInspection.countDocuments(query);
    const totalPages = Math.ceil(totalQCs / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      qualityInspections,
      pagination: { currentPage: page, totalPages, totalQCs, limit, hasNextPage, hasPrevPage },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching quality inspections: " + error.message,
    });
  }
};

// ─── CREATE QC ────────────────────────────────────────────────────────────────
// Flow:
//   1. Save QC (pre-save hook assigns qcNumber, nothing else)
//   2. Generate assets with URL QR codes using the qcNumber we now have
//   3. Attach assets to items and save once more
// This is a single clean two-step save — no post-save hook, no duplicate assets.
exports.createQualityInspection = async (req, res) => {
  try {
    const user = req.user;
    const qcData = req.body;

    // Step 1 — save to get the auto-generated qcNumber from the pre-save hook
    const newQC = new QualityInspection({
      ...qcData,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
      status: 'Completed',
    });

    await newQC.save();

    // Step 2 — generate URL-based assets now that qcNumber is available
    let totalAssets = 0;

    for (const item of newQC.items) {
      const assets = generateAssetsForItem(newQC, item);
      item.assets = assets;
      totalAssets += assets.length;
    }

    newQC.totalAssets = totalAssets;

    // Step 3 — save with assets (pre-save hook skips qcNumber since it already exists)
    await newQC.save();

    await newQC.populate('createdBy', 'name email');
    await newQC.populate('company', 'name');

    res.status(201).json({
      success: true,
      message: "Quality inspection created successfully with assets",
      qualityInspection: newQC,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ error: "Error creating quality inspection: " + error.message });
    }
  }
};

exports.deleteQualityInspection = async (req, res) => {
  try {
    const qcId = req.params.id;
    const qc = await QualityInspection.findByIdAndDelete(qcId);

    if (!qc) {
      return res.status(404).json({ success: false, error: "Quality inspection not found" });
    }

    res.status(200).json({ success: true, message: "Quality inspection deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting quality inspection: " + error.message
    });
  }
};

exports.updateQualityInspection = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingQC = await QualityInspection.findById(id);

    if (!existingQC) {
      return res.status(404).json({ success: false, error: "Quality inspection not found" });
    }

    if (updatedData.items) {
      let totalAssets = 0;

      for (let i = 0; i < updatedData.items.length; i++) {
        const item = updatedData.items[i];
        const existingItem = existingQC.items[i];

        if (
          existingItem &&
          (item.qcOkQuantity !== existingItem.qcOkQuantity ||
            item.serviceWarrantyMonths !== existingItem.serviceWarrantyMonths ||
            item.itemsPerBox !== existingItem.itemsPerBox)
        ) {
          // Preserve dispatched/in-service assets, regenerate the rest
          const existingAssets =
            existingItem.assets?.filter(
              a => a.status === 'Dispatched' || a.status === 'In Service'
            ) || [];

          const newAssetsNeeded = item.qcOkQuantity - existingAssets.length;
          if (newAssetsNeeded > 0) {
            const tempQC = { ...existingQC.toObject(), items: [item] };
            const newAssets = generateAssetsForItem(tempQC, item);
            item.assets = [...existingAssets, ...newAssets.slice(0, newAssetsNeeded)];
          } else {
            item.assets = existingAssets.slice(0, item.qcOkQuantity);
          }
        } else if (existingItem?.assets) {
          item.assets = existingItem.assets;
        }

        totalAssets += item.qcOkQuantity || 0;
      }

      updatedData.totalAssets = totalAssets;
    }

    const updatedQC = await QualityInspection.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    })
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName');

    res.status(200).json({
      success: true,
      message: "Quality inspection updated successfully",
      updatedQC
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Error updating quality inspection: " + error.message
    });
  }
};

// ─── GET ASSET BY QR / ASSET ID ──────────────────────────────────────────────
// Handles both old JSON-based QR codes and new URL-based QR codes.
// When the user types an Asset ID manually, the plain ID is used directly.
exports.getAssetByQR = async (req, res) => {
  try {
    const { qrData } = req.params;

    // Resolve the actual assetId from whatever was passed:
    //   - Full URL:  https://proclient360.com/asset/QC-2026-27-002-MIC-0001
    //   - Plain ID:  QC-2026-27-002-MIC-0001
    //   - Old JSON:  {"assetId":"QC-...","qcNumber":"...",...}
    let assetId = qrData;

    try {
      // Case 1: old JSON-based QR code
      const parsed = JSON.parse(decodeURIComponent(qrData));
      if (parsed.assetId) assetId = parsed.assetId;
    } catch {
      // Case 2: URL-based QR code — extract the last path segment
      if (qrData.startsWith('http')) {
        assetId = qrData.split('/').pop();
      }
      // Case 3: plain asset ID — use as-is
    }

    const qc = await QualityInspection.findOne({ 'items.assets.assetId': assetId })
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName')
      .lean();

    if (!qc) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    let asset = null;
    let itemInfo = null;

    for (const item of qc.items) {
      const foundAsset = item.assets?.find(a => a.assetId === assetId);
      if (foundAsset) {
        asset = foundAsset;
        itemInfo = {
          brandName: item.brandName,
          modelNo: item.modelNo,
          receivedQuantity: item.receivedQuantity,
          unit: item.unit,
          qcOkQuantity: item.qcOkQuantity,
        };
        break;
      }
    }

    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found in QC" });
    }

    // Auto-expire warranty status
    if (
      asset.warrantyExpiryDate &&
      new Date() > new Date(asset.warrantyExpiryDate) &&
      asset.status !== 'Warranty Expired'
    ) {
      await QualityInspection.updateOne(
        { 'items.assets.assetId': assetId },
        { $set: { 'items.$.assets.$[elem].status': 'Warranty Expired' } },
        { arrayFilters: [{ 'elem.assetId': assetId }] }
      );
      asset.status = 'Warranty Expired';
    }

    res.status(200).json({
      success: true,
      message: "Asset found",
      asset: {
        ...asset,
        qcNumber: qc.qcNumber,
        grnNumber: qc.grnNumber,
        qcDate: qc.qcDate,
        company: qc.company,
        itemInfo,
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Error fetching asset: " + error.message });
  }
};

exports.updateAssetStatus = async (req, res) => {
  try {
    const { qcId, assetId } = req.params;
    const { status, outDate, assignedTo, serviceNote } = req.body;

    const qc = await QualityInspection.findById(qcId);
    if (!qc) {
      return res.status(404).json({ success: false, error: "QC not found" });
    }

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
              servicedBy: req.user?.name || 'System',
            });
          }
          assetFound = true;
          break;
        }
      }
      if (assetFound) break;
    }

    if (!assetFound) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    await qc.save();

    res.status(200).json({ success: true, message: "Asset status updated successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error updating asset status: " + error.message
    });
  }
};

exports.getAllAssets = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { q, status, warrantyStatus } = req.query;

    let baseQuery = {
      company: user.company || user._id,
      'items.assets.0': { $exists: true },
    };

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

    const qcs = await QualityInspection.find(baseQuery)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('company', 'name')
      .populate('items.assets.assignedTo', 'customerName')
      .sort({ createdAt: -1 })
      .lean();

    let allAssets = [];
    for (const qc of qcs) {
      for (const item of qc.items) {
        if (item.assets && item.assets.length > 0) {
          for (const asset of item.assets) {
            if (status && status !== 'All' && asset.status !== status) continue;

            if (warrantyStatus) {
              const now = new Date();
              if (warrantyStatus === 'Active' && (!asset.warrantyExpiryDate || now > new Date(asset.warrantyExpiryDate))) continue;
              if (warrantyStatus === 'Expired' && (!asset.warrantyExpiryDate || now <= new Date(asset.warrantyExpiryDate))) continue;
              if (warrantyStatus === 'No Warranty' && asset.serviceWarrantyMonths > 0) continue;
            }

            allAssets.push({
              ...asset,
              qcNumber: qc.qcNumber,
              qcId: qc._id,
              grnNumber: qc.grnNumber,
              qcDate: qc.qcDate,
              brandName: item.brandName,
              modelNo: item.modelNo,
              companyName: qc.company?.name,
            });
          }
        }
      }
    }

    const totalQCs = await QualityInspection.countDocuments(baseQuery);
    const totalPages = Math.ceil(totalQCs / limit);

    res.status(200).json({
      success: true,
      assets: allAssets,
      pagination: { currentPage: page, totalPages, totalAssets: allAssets.length, limit },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error fetching assets: " + error.message
    });
  }
};

// PUBLIC route — no auth required for mobile QR scanning
exports.getPublicAssetByAssetId = async (req, res) => {
  try {
    const { assetId } = req.params;

    const qc = await QualityInspection.findOne({
      'items.assets.assetId': assetId
    }).lean();

    if (!qc) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    let asset = null;

    for (const item of qc.items) {
      const foundAsset = item.assets?.find(a => a.assetId === assetId);
      if (foundAsset) {
        asset = foundAsset;
        break;
      }
    }

    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    res.status(200).json({
      success: true,
      asset: {
        assetId: asset.assetId,
        brandName: asset.brandName,
        modelNo: asset.modelNo,
        unit: asset.unit,
        inDate: asset.inDate,
        outDate: asset.outDate,
        serviceWarrantyMonths: asset.serviceWarrantyMonths,
        warrantyExpiryDate: asset.warrantyExpiryDate,
        status: asset.status,
        boxNumber: asset.boxNumber,
        serviceHistory: asset.serviceHistory || [],
        qcNumber: qc.qcNumber,
        grnNumber: qc.grnNumber,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching asset: " + error.message });
  }
};