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

// New function to get vendor by name
exports.getVendorByName = async (req, res) => {
  try {
    const { name } = req.params;
    const user = req.user;
    
    const vendor = await Vendor.findOne({
      vendorName: { $regex: new RegExp(name, 'i') }, // Case-insensitive search
      company: user.company ? user.company : user._id
    });
    
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: "Vendor not found" 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      vendor 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error fetching vendor: " + error.message
    });
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

    // Check if vendor with same email exists - KEEP THIS VALIDATION FOR NORMAL VENDOR CREATION
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
    
    // Check if vendor is registered from link
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        error: "Vendor Not Found!!" 
      });
    }
    
    // Prevent deletion of vendors registered via link
    if (vendor.registeredFromLink) {
      return res.status(403).json({ 
        success: false, 
        error: "Cannot delete vendors registered through link" 
      });
    }
    
    await Vendor.findByIdAndDelete(vendorId);

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
    
    // Prevent update of vendors registered via link
    if (existingVendor.registeredFromLink) {
      return res.status(403).json({ 
        success: false, 
        error: "Cannot update vendors registered through link" 
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

exports.generateVendorLink = async (req, res) => {
  try {
    const { linkId, linkUrl } = req.body;
    const user = req.user;
    
    console.log("Generating vendor link with ID:", linkId);
    
    // Check if linkId already exists
    const existingLink = await VendorLink.findOne({ linkId });
    if (existingLink) {
      console.log("Link ID already exists:", linkId);
      return res.status(400).json({
        success: false,
        error: "Link ID already exists"
      });
    }
    
    const newVendorLink = new VendorLink({
      linkId,
      linkUrl,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
      isActive: true
    });
    
    await newVendorLink.save();
    
    console.log("Vendor link generated successfully:", newVendorLink);
    
    res.status(201).json({
      success: true,
      message: "Vendor link generated successfully",
      linkId
    });
  } catch (error) {
    console.error("Error in generateVendorLink:", error);
    res.status(500).json({
      success: false,
      error: "Error generating vendor link: " + error.message
    });
  }
};

exports.getVendorLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    
    console.log("Looking for link with ID:", linkId);
    
    // First try to find the link
    const vendorLink = await VendorLink.findOne({ linkId });
    
    console.log("Found vendor link:", vendorLink);
    
    if (!vendorLink) {
      console.log("No link found with this ID");
      return res.status(404).json({
        success: false,
        error: "Invalid link ID"
      });
    }
    
    // Check if the link is active
    if (!vendorLink.isActive) {
      console.log("Link is not active");
      return res.status(404).json({
        success: false,
        error: "Link has already been used"
      });
    }
    
    res.status(200).json({
      success: true,
      linkId
    });
  } catch (error) {
    console.error("Error in getVendorLink:", error);
    res.status(500).json({
      success: false,
      error: "Error fetching vendor link: " + error.message
    });
  }
};

exports.registerVendorFromLink = async (req, res) => {
  try {
    // Log the request body type and content
    console.log("Request received for vendor registration");
    console.log("Request body type:", typeof req.body);
    
    // Check if it's FormData
    if (req.body instanceof Object && !(req.body instanceof Array)) {
      console.log("Processing FormData request");
      
      // Extract linkId from the request
      let linkId = null;
      let vendorId = null; // For updating existing vendors
      
      // Try to get linkId from different possible locations
      if (req.body.linkId) {
        linkId = req.body.linkId;
      }
      
      if (req.body.vendorId) {
        vendorId = req.body.vendorId;
      }
      
      if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        // For FormData, we need to parse it differently
        // This is a simplified approach - in a real app, you might use multer or similar
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          const data = Buffer.concat(chunks).toString();
          // Parse the FormData manually (this is a simplified approach)
          const formData = {};
          data.split('\r\n').forEach(line => {
            if (line.includes('Content-Disposition') && line.includes('name=')) {
              const nameMatch = line.match(/name="([^"]+)"/);
              if (nameMatch) {
                const fieldName = nameMatch[1];
                // Find the next line that contains the value
                const nextLineIndex = data.split('\r\n').indexOf(line) + 2;
                const value = data.split('\r\n')[nextLineIndex];
                formData[fieldName] = value;
              }
            }
          });
          
          linkId = formData.linkId;
          vendorId = formData.vendorId;
          console.log("Extracted linkId from FormData:", linkId);
          console.log("Extracted vendorId from FormData:", vendorId);
          
          // Continue with the registration process
          processVendorRegistration(linkId, vendorId, formData, res);
        });
        return; // Exit early since we're handling asynchronously
      }
      
      if (!linkId) {
        console.log("No linkId found in request");
        return res.status(400).json({
          success: false,
          error: "No linkId provided"
        });
      }
      
      // For regular JSON requests
      processVendorRegistration(linkId, vendorId, req.body, res);
    } else {
      console.log("Invalid request body type");
      return res.status(400).json({
        success: false,
        error: "Invalid request format"
      });
    }
  } catch (error) {
    console.error("Error in registerVendorFromLink:", error);
    res.status(500).json({
      success: false,
      error: "Error registering vendor: " + error.message
    });
  }
};

// Helper function to process vendor registration
async function processVendorRegistration(linkId, vendorId, formData, res) {
  try {
    console.log("Registering vendor with linkId:", linkId);
    
    // Validate the link
    const vendorLink = await VendorLink.findOne({ linkId, isActive: true });
    
    console.log("Found vendor link:", vendorLink);
    
    if (!vendorLink) {
      console.log("No valid link found for registration");
      return res.status(400).json({
        success: false,
        error: "Invalid or expired link"
      });
    }
    
    // Extract vendor data from the request
    const vendorData = {};
    
    // Add all vendor fields from the request body
    const vendorFields = [
      'vendorName', 'email', 'typeOfVendor', 'GSTNo', 'brandName', 'modelName', 
      'price', 'websiteURL', 'linkedinURL', 'twitterProfile', 'vendorContactPersonName1', 
      'phoneNumber1', 'vendorContactPersonName2', 'phoneNumber2', 'materialCategory', 
      'vendorRating', 'brandsWorkWith', 'customVendorType', 'remarks', 'manualAddress'
    ];
    
    vendorFields.forEach(field => {
      if (formData[field]) {
        vendorData[field] = formData[field];
      }
    });
    
    // Handle billing address
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
    
    // For Import and Other vendors, set default address
    if (vendorData.typeOfVendor === 'Import' || vendorData.typeOfVendor === 'Other') {
      vendorData.billingAddress = {
        add: "Not applicable for this vendor type",
        city: "N/A",
        state: "N/A",
        country: "N/A",
        pincode: 0
      };
    }
    
    // Set company and registration flags
    vendorData.company = vendorLink.company;
    vendorData.registeredFromLink = true;
    vendorData.linkId = linkId;
    
    let vendor;
    
    if (vendorId) {
      // Update existing vendor
      vendor = await Vendor.findByIdAndUpdate(vendorId, vendorData, {
        new: true,
        runValidators: true,
      });
      
      if (!vendor) {
        return res.status(404).json({
          success: false,
          error: "Vendor not found for update"
        });
      }
      
      console.log("Vendor updated successfully:", vendor);
    } else {
      // Create new vendor
      // First check if a vendor with this email already exists in the same company
      const existingVendor = await Vendor.findOne({
        email: vendorData.email,
        company: vendorData.company
      });
      
      if (existingVendor) {
        // If vendor exists with same email, update it instead of creating new one
        console.log("Vendor with this email already exists, updating existing vendor");
        vendor = await Vendor.findByIdAndUpdate(existingVendor._id, vendorData, {
          new: true,
          runValidators: true,
        });
        
        // Update the vendor link to mark it as used
        vendorLink.usedBy = vendor._id;
        vendorLink.usedAt = new Date();
        vendorLink.isActive = false;
        await vendorLink.save();
        
        console.log("Existing vendor updated successfully:", vendor);
      } else {
        // Create new vendor
        vendor = new Vendor(vendorData);
        await vendor.save();
        
        // Update the vendor link to mark it as used
        vendorLink.usedBy = vendor._id;
        vendorLink.usedAt = new Date();
        vendorLink.isActive = false;
        await vendorLink.save();
        
        console.log("New vendor registered successfully:", vendor);
      }
    }
    
    res.status(201).json({
      success: true,
      message: vendorId ? "Vendor updated successfully" : "Vendor registered successfully",
      vendor: vendor // Return the vendor data
    });
  } catch (error) {
    console.error("Error in processVendorRegistration:", error);
    
    // Handle duplicate key error specifically
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      return res.status(409).json({
        success: false,
        error: "A vendor with this email already exists. Please use a different email address."
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Error registering vendor: " + error.message
    });
  }
}