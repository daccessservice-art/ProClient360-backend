const Vendor = require("../models/vendorModel");
const VendorHistory = require("../models/vendorHistoryModel");

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

exports.createVendor = async (req, res) => {
  try {
    const user = req.user;
    const {
      vendorName,
      typeOfVendor,
      materialCategory,
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

    // Check if vendor with same email exists
    const vendor = await Vendor.find({
      company: user.company ? user.company : user._id,
      email: email,
    });
    if (vendor.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: "Vendor already exist please use different email Id" 
      });
    }

    // For Import and Other vendors, set default address
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
      vendorRating,
      brandsWorkWith: typeOfVendor === 'B2B Material' ? brandsWorkWith : "",
      company: user.company ? user.company : user._id,
      email: email.toLowerCase().trim(),
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
      res.status(201).json({
        success: true,
        message: "Vendor created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid vendor data" 
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
        error: "Error creating vendor: " + error.message 
      });
    }
  }
};

exports.deleteVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const vendor = await Vendor.findByIdAndDelete(vendorId);

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: "Vendor Not Found!!" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Vendor deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting vendor: " + error.message
    });
  }
};

exports.updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingVendor = await Vendor.findById(id);

    if (!existingVendor) {
      return res.status(404).json({ 
        success: false, 
        error: "Vendor not found" 
      });
    }

    let changes = [];

    const trackChanges = (fieldName, oldValue, newValue) => {
      if (oldValue !== newValue) {
        changes.push({
          vendorId: id,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          changeReason: req.body.changeReason || "Updated via vendor edit",
        });
      }
    };

    // Track changes for all fields
    trackChanges("vendorName", existingVendor.vendorName, updatedData.vendorName);
    trackChanges("typeOfVendor", existingVendor.typeOfVendor, updatedData.typeOfVendor);
    trackChanges("materialCategory", existingVendor.materialCategory, updatedData.materialCategory);
    trackChanges("vendorRating", existingVendor.vendorRating, updatedData.vendorRating);
    trackChanges("brandsWorkWith", existingVendor.brandsWorkWith, updatedData.brandsWorkWith);
    trackChanges("email", existingVendor.email, updatedData.email);
    trackChanges("GSTNo", existingVendor.GSTNo, updatedData.GSTNo);
    trackChanges(
      "vendorContactPersonName1",
      existingVendor.vendorContactPersonName1,
      updatedData.vendorContactPersonName1
    );
    trackChanges(
      "phoneNumber1",
      existingVendor.phoneNumber1,
      updatedData.phoneNumber1
    );
    trackChanges(
      "vendorContactPersonName2",
      existingVendor.vendorContactPersonName2,
      updatedData.vendorContactPersonName2
    );
    trackChanges(
      "phoneNumber2",
      existingVendor.phoneNumber2,
      updatedData.phoneNumber2
    );
    trackChanges(
      "customVendorType",
      existingVendor.customVendorType,
      updatedData.customVendorType
    );
    trackChanges(
      "remarks",
      existingVendor.remarks,
      updatedData.remarks
    );
    trackChanges(
      "manualAddress",
      existingVendor.manualAddress,
      updatedData.manualAddress
    );

    // Handle address changes conditionally
    if (updatedData.typeOfVendor !== 'Import' && updatedData.typeOfVendor !== 'Other' && updatedData.billingAddress) {
      trackChanges(
        "billingAddress.add",
        existingVendor.billingAddress?.add,
        updatedData.billingAddress.add
      );
      trackChanges(
        "billingAddress.city",
        existingVendor.billingAddress?.city,
        updatedData.billingAddress.city
      );
      trackChanges(
        "billingAddress.state",
        existingVendor.billingAddress?.state,
        updatedData.billingAddress.state
      );
      trackChanges(
        "billingAddress.country",
        existingVendor.billingAddress?.country,
        updatedData.billingAddress.country
      );
      trackChanges(
        "billingAddress.pincode",
        existingVendor.billingAddress?.pincode,
        updatedData.billingAddress.pincode
      );
    }

    // For Import and Other vendors, set default address
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

    res.status(200).json({ 
      success: true, 
      message: "Vendor updated successfully", 
      updatedVendor 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating vendor: " + error.message 
    });
  }
};