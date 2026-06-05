const Vendor = require("../models/vendorModel");
const VendorHistory = require("../models/vendorHistoryModel");
const VendorLink = require("../models/vendorLinkModel");

exports.getVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found" });
    }
    res.status(200).json({ success: true, message: "Vendor fetched successfully", vendor });
  } catch (error) {
    res.status(500).json({ error: "Error in getting a vendor: " + error.message });
  }
};

exports.getVendorByName = async (req, res) => {
  try {
    const { name } = req.params;

    let query = {
      vendorName: { $regex: new RegExp(name, 'i') }
    };

    if (req.user) {
      query.company = req.user.company ? req.user.company : req.user._id;
    }

    const vendor = await Vendor.findOne(query);

    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor not found" });
    }

    res.status(200).json({ success: true, vendor });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching vendor: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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
          { vendorName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
          { phoneNumber1: { $regex: searchRegex } },
          { typeOfVendor: { $regex: searchRegex } },
          { materialCategory: { $regex: searchRegex } },
          { customMaterialCategory: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const vendors = await Vendor.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("company", "name")
      .sort({ createdAt: -1 })
      .lean();

    if (vendors.length === 0) {
      return res.status(404).json({ success: false, error: "No vendors found" });
    }

    const totalVendors = await Vendor.countDocuments(query);
    const totalPages = Math.ceil(totalVendors / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      vendors,
      pagination: {
        currentPage: page,
        totalPages,
        totalVendors,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching vendors: " + error.message,
    });
  }
}; 

// helper: if email is "na" or has no "@", make it unique
const normalizeEmail = (email) => {
  const e = email.toLowerCase().trim();
  if (e === 'na' || !e.includes('@')) {
    return `na_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@vendor.local`;
  }
  return e;
};

exports.createVendor = async (req, res) => {
  try {
    const user = req.user;
    const {
      vendorName,
      typeOfVendor,
      materialCategory,
      customMaterialCategory,
      vendorRating,
      brandsWorkWith,
      billingAddress,
      email,
      GSTNo,
      vendorContactPersonName1,
      phoneNumber1,
      vendorContactPersonName2,
      phoneNumber2,
      customVendorType,
      remarks,
      manualAddress
    } = req.body;

    let addressData = billingAddress;
    if (typeOfVendor === 'Import' || typeOfVendor === 'Other') {
      addressData = {
        add: "Not applicable for this vendor type",
        city: "N/A",
        state: "N/A",
        country: "N/A",
        pincode: 0
      };
    }

    const newVendor = Vendor({
      vendorName,
      typeOfVendor,
      materialCategory,
      customMaterialCategory: materialCategory === 'Other' ? customMaterialCategory : "",
      vendorRating,
      brandsWorkWith: typeOfVendor === 'B2B Material' ? brandsWorkWith : "",
      company: user.company ? user.company : user._id,
      email: normalizeEmail(email),
      createdBy: user._id,
      vendorContactPersonName1,
      phoneNumber1,
      vendorContactPersonName2,
      phoneNumber2,
      billingAddress: addressData,
      GSTNo,
      customVendorType: typeOfVendor === 'Other' ? customVendorType : "",
      remarks: remarks || "",
      manualAddress: typeOfVendor === 'Import' ? manualAddress : ""
    });

    if (newVendor) {
      await newVendor.save();
      res.status(201).json({ success: true, message: "Vendor created successfully" });
    } else {
      res.status(400).json({ success: false, error: "Invalid vendor data" });
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ error: "Error creating vendor: " + error.message });
    }
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ success: false, error: "Vendor Not Found!!" });
    }

    await Vendor.findByIdAndDelete(vendorId);

    res.status(200).json({ success: true, message: "Vendor deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error while deleting vendor: " + error.message });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // normalize email on update too
    if (updatedData.email) {
      updatedData.email = normalizeEmail(updatedData.email);
    }

    // Handle customMaterialCategory: clear it if materialCategory is not "Other"
    if (updatedData.materialCategory && updatedData.materialCategory !== 'Other') {
      updatedData.customMaterialCategory = "";
    }

    const existingVendor = await Vendor.findById(id);

    if (!existingVendor) {
      return res.status(404).json({ success: false, error: "Vendor not found" });
    }

    let changes = [];

    const trackChanges = (fieldName, oldValue, newValue) => {
      if (oldValue !== newValue) {
        changes.push({
          vendorId: id,
          fieldName,
          oldValue,
          newValue,
          changeReason: req.body.changeReason || "Updated via vendor edit",
        });
      }
    };

    trackChanges("vendorName", existingVendor.vendorName, updatedData.vendorName);
    trackChanges("typeOfVendor", existingVendor.typeOfVendor, updatedData.typeOfVendor);
    trackChanges("materialCategory", existingVendor.materialCategory, updatedData.materialCategory);
    trackChanges("customMaterialCategory", existingVendor.customMaterialCategory, updatedData.customMaterialCategory);
    trackChanges("vendorRating", existingVendor.vendorRating, updatedData.vendorRating);
    trackChanges("brandsWorkWith", existingVendor.brandsWorkWith, updatedData.brandsWorkWith);
    trackChanges("email", existingVendor.email, updatedData.email);
    trackChanges("GSTNo", existingVendor.GSTNo, updatedData.GSTNo);
    trackChanges("vendorContactPersonName1", existingVendor.vendorContactPersonName1, updatedData.vendorContactPersonName1);
    trackChanges("phoneNumber1", existingVendor.phoneNumber1, updatedData.phoneNumber1);
    trackChanges("vendorContactPersonName2", existingVendor.vendorContactPersonName2, updatedData.vendorContactPersonName2);
    trackChanges("phoneNumber2", existingVendor.phoneNumber2, updatedData.phoneNumber2);
    trackChanges("customVendorType", existingVendor.customVendorType, updatedData.customVendorType);
    trackChanges("remarks", existingVendor.remarks, updatedData.remarks);
    trackChanges("manualAddress", existingVendor.manualAddress, updatedData.manualAddress);

    if (updatedData.typeOfVendor !== 'Import' && updatedData.typeOfVendor !== 'Other' && updatedData.billingAddress) {
      trackChanges("billingAddress.add", existingVendor.billingAddress?.add, updatedData.billingAddress.add);
      trackChanges("billingAddress.city", existingVendor.billingAddress?.city, updatedData.billingAddress.city);
      trackChanges("billingAddress.state", existingVendor.billingAddress?.state, updatedData.billingAddress.state);
      trackChanges("billingAddress.country", existingVendor.billingAddress?.country, updatedData.billingAddress.country);
      trackChanges("billingAddress.pincode", existingVendor.billingAddress?.pincode, updatedData.billingAddress.pincode);
    }

    if (updatedData.typeOfVendor === 'Import' || updatedData.typeOfVendor === 'Other') {
      updatedData.billingAddress = {
        add: "Not applicable for this vendor type",
        city: "N/A",
        state: "N/A",
        country: "N/A",
        pincode: 0
      };
    }

    const updatedVendor = await Vendor.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    if (changes.length > 0) {
      await VendorHistory.insertMany(changes);
    }

    res.status(200).json({ success: true, message: "Vendor updated successfully", updatedVendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Error updating vendor: " + error.message });
  }
};

exports.generateVendorLink = async (req, res) => {
  try {
    const { linkId, linkUrl } = req.body;
    const user = req.user;

    const existingLink = await VendorLink.findOne({ linkId });
    if (existingLink) {
      return res.status(400).json({ success: false, error: "Link ID already exists" });
    }

    const newVendorLink = new VendorLink({
      linkId,
      linkUrl,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
      isActive: true
    });

    await newVendorLink.save();

    res.status(201).json({ success: true, message: "Vendor link generated successfully", linkId });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error generating vendor link: " + error.message });
  }
};

exports.getVendorLink = async (req, res) => {
  try {
    const { linkId } = req.params;

    const vendorLink = await VendorLink.findOne({ linkId });

    if (!vendorLink) {
      return res.status(404).json({ success: false, error: "Invalid link ID" });
    }

    if (!vendorLink.isActive) {
      return res.status(404).json({ success: false, error: "Link has already been used" });
    }

    res.status(200).json({ success: true, linkId });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching vendor link: " + error.message });
  }
};

exports.registerVendorFromLink = async (req, res) => {
  try {
    if (req.body instanceof Object && !(req.body instanceof Array)) {
      let linkId = null;
      let vendorId = null;

      if (req.body.linkId) linkId = req.body.linkId;
      if (req.body.vendorId) vendorId = req.body.vendorId;

      if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          const data = Buffer.concat(chunks).toString();
          const formData = {};
          data.split('\r\n').forEach(line => {
            if (line.includes('Content-Disposition') && line.includes('name=')) {
              const nameMatch = line.match(/name="([^"]+)"/);
              if (nameMatch) {
                const fieldName = nameMatch[1];
                const nextLineIndex = data.split('\r\n').indexOf(line) + 2;
                const value = data.split('\r\n')[nextLineIndex];
                formData[fieldName] = value;
              }
            }
          });
          linkId = formData.linkId;
          vendorId = formData.vendorId;
          processVendorRegistration(linkId, vendorId, formData, res);
        });
        return;
      }

      if (!linkId) {
        return res.status(400).json({ success: false, error: "No linkId provided" });
      }

      processVendorRegistration(linkId, vendorId, req.body, res);
    } else {
      return res.status(400).json({ success: false, error: "Invalid request format" });
    }
  } catch (error) {
    console.error("Error in registerVendorFromLink:", error);
    res.status(500).json({ success: false, error: "Error registering vendor: " + error.message });
  }
};

async function processVendorRegistration(linkId, vendorId, formData, res) {
  try {
    const vendorLink = await VendorLink.findOne({ linkId, isActive: true });

    if (!vendorLink) {
      return res.status(400).json({ success: false, error: "Invalid or expired link" });
    }

    const vendorData = {};

    const vendorFields = [
      'vendorName', 'email', 'typeOfVendor', 'GSTNo', 'brandName', 'modelName',
      'price', 'websiteURL', 'linkedinURL', 'twitterProfile', 'vendorContactPersonName1',
      'phoneNumber1', 'vendorContactPersonName2', 'phoneNumber2', 'materialCategory',
      'customMaterialCategory', 'vendorRating', 'brandsWorkWith', 'customVendorType',
      'remarks', 'manualAddress'
    ];

    vendorFields.forEach(field => {
      if (formData[field]) vendorData[field] = formData[field];
    });

    // normalize email in link registration too
    if (vendorData.email) {
      vendorData.email = normalizeEmail(vendorData.email);
    }

    // Handle customMaterialCategory
    if (vendorData.materialCategory && vendorData.materialCategory !== 'Other') {
      vendorData.customMaterialCategory = "";
    }

    if (formData['billingAddress.add'] || formData['billingAddress.city'] ||
      formData['billingAddress.state'] || formData['billingAddress.country'] ||
      formData['billingAddress.pincode']) {
      vendorData.billingAddress = {
        add: formData['billingAddress.add'] || "",
        city: formData['billingAddress.city'] || "",
        state: formData['billingAddress.state'] || "",
        country: formData['billingAddress.country'] || "",
        pincode: formData['billingAddress.pincode'] || 0
      };
    }

    if (vendorData.typeOfVendor === 'Import' || vendorData.typeOfVendor === 'Other') {
      vendorData.billingAddress = {
        add: "Not applicable for this vendor type",
        city: "N/A",
        state: "N/A",
        country: "N/A",
        pincode: 0
      };
    }

    vendorData.company = vendorLink.company;
    vendorData.registeredFromLink = true;
    vendorData.linkId = linkId;

    let vendor;

    if (vendorId) {
      vendor = await Vendor.findByIdAndUpdate(vendorId, vendorData, { new: true, runValidators: true });
      if (!vendor) {
        return res.status(404).json({ success: false, error: "Vendor not found for update" });
      }
    } else {
      const existingVendor = await Vendor.findOne({ email: vendorData.email, company: vendorData.company });

      if (existingVendor) {
        vendor = await Vendor.findByIdAndUpdate(existingVendor._id, vendorData, { new: true, runValidators: true });
      } else {
        vendor = new Vendor(vendorData);
        await vendor.save();
      }

      vendorLink.usedBy = vendor._id;
      vendorLink.usedAt = new Date();
      vendorLink.isActive = false;
      await vendorLink.save();
    }

    res.status(201).json({
      success: true,
      message: vendorId ? "Vendor updated successfully" : "Vendor registered successfully",
      vendor
    });
  } catch (error) {
    console.error("Error in processVendorRegistration:", error);
    res.status(500).json({ success: false, error: "Error registering vendor: " + error.message });
  }
}