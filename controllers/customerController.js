const Customer = require("../models/customerModel");
const jwt = require("jsonwebtoken");
const CustomerHistory = require("../models/customerHistoryModel");
const Project = require("../models/projectModel");

exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }
    res.status(200).json({ success: true, message: "Customer fetched successfully", customer });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error in getting a customer: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    // Extract pagination query parameters
    let page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 10; // Default to 10 records per page
    let skip = (page - 1) * limit; // Calculate documents to skip

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
          { custName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { GSTNo: { $regex: searchRegex } },
          { phoneNumber1: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }


    // Fetch paginated customers
    const customers = await Customer.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email") // Populate createdBy (adjust fields as needed)
      .populate("company", "name") // Populate company (adjust fields as needed)
      .sort({ createdAt: -1 })
      .lean(); // Optimize performance

    // Check if customers exist
    if (customers.length === 0) {
      return res.status(404).json({ success: false, error: "No customers found" });
    }

    // Get total number of customers for the query
    const totalCustomers = await Customer.countDocuments(query);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCustomers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Send response with customers and pagination metadata
    res.status(200).json({
      success: true,
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching customers: " + error.message,
    });
  }
};


exports.createCustomer = async (req, res) => {
  try {
    const user= req.user;
    const {
      custName,
      billingAddress,
      email,
      GSTNo,
      customerContactPersonName1,
      phoneNumber1,
      customerContactPersonName2,
      phoneNumber2,
      zone,
    } = req.body;

    const customer = await Customer.find({
      company: user.company ? user.company : user._id,
      email: email,
    });
    if (customer.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: "Customer already exist please use different email Id" });
    }


    const newCust = Customer({
      custName,
      GSTNo,
      company: user.company ? user.company : user._id,
      email: email.toLowerCase().trim(),
      createdBy: user._id,
      customerContactPersonName1,
      phoneNumber1,
      customerContactPersonName2,
      phoneNumber2,
      billingAddress,
      zone,
    });

    // if(user && user.company)
    //     newCust=user.company;
    // else
    //     newCust=decoded.userId;

    if (newCust) {
      await newCust.save();
      res.status(201).json({
        success: true,
        message: "Customer created successfully",
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid customer data" 
      });
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ 
        success:false, 
        error: error.message 
      });
    } else {
      res
        .status(500)
        .json({ error: "Error creating customer: " + error.message });
    }
  }
};


exports.deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.id;

    // Check if there are any projects associated with the customer
    const projects = await Project.find({ custId: customerId });

    if (projects.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Customer cannot be deleted as they have associated projects."
      });
    }

    // Proceed to delete the customer if no projects are found
    const customer = await Customer.findByIdAndDelete(customerId);

    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer Not Found!!" });
    }

    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting customer: " + error.message
    });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Find the existing customer
    const existingCustomer = await Customer.findById(id);

    if (!existingCustomer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    // Prepare an array to store changes
    let changes = [];

    // Helper function to track changes
    const trackChanges = (fieldName, oldValue, newValue) => {
      if (oldValue !== newValue) {
        changes.push({
          customerId: id,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          changeReason: req.body.changeReason || "Updated via customer edit",
        });
      }
    };

    // Compare fields and track changes
    trackChanges("custName", existingCustomer.custName, updatedData.custName);
    trackChanges("email", existingCustomer.email, updatedData.email);
    trackChanges("GSTNo", existingCustomer.GSTNo, updatedData.GSTNo);
    trackChanges(
      "customerContactPersonName1",
      existingCustomer.customerContactPersonName1,
      updatedData.customerContactPersonName1
    );
    trackChanges(
      "phoneNumber1",
      existingCustomer.phoneNumber1,
      updatedData.phoneNumber1
    );
    trackChanges(
      "customerContactPersonName2",
      existingCustomer.customerContactPersonName2,
      updatedData.customerContactPersonName2
    );
    trackChanges(
      "phoneNumber2",
      existingCustomer.phoneNumber2,
      updatedData.phoneNumber2
    );

    // Compare nested objects like billingAddress and deliveryAddress
    if (updatedData.billingAddress) {
      trackChanges(
        "billingAddress.add",
        existingCustomer.billingAddress?.add,
        updatedData.billingAddress.add
      );
      trackChanges(
        "billingAddress.city",
        existingCustomer.billingAddress?.city,
        updatedData.billingAddress.city
      );
      trackChanges(
        "billingAddress.state",
        existingCustomer.billingAddress?.state,
        updatedData.billingAddress.state
      );
      trackChanges(
        "billingAddress.country",
        existingCustomer.billingAddress?.country,
        updatedData.billingAddress.country
      );
      trackChanges(
        "billingAddress.pincode",
        existingCustomer.billingAddress?.pincode,
        updatedData.billingAddress.pincode
      );
    }

    if (updatedData.deliveryAddress) {
      trackChanges(
        "deliveryAddress.add",
        existingCustomer.deliveryAddress?.add,
        updatedData.deliveryAddress.add
      );
      trackChanges(
        "deliveryAddress.city",
        existingCustomer.deliveryAddress?.city,
        updatedData.deliveryAddress.city
      );
      trackChanges(
        "deliveryAddress.state",
        existingCustomer.deliveryAddress?.state,
        updatedData.deliveryAddress.state
      );
      trackChanges(
        "deliveryAddress.country",
        existingCustomer.deliveryAddress?.country,
        updatedData.deliveryAddress.country
      );
      trackChanges(
        "deliveryAddress.pincode",
        existingCustomer.deliveryAddress?.pincode,
        updatedData.deliveryAddress.pincode
      );
    }

    // Save the updated customer record
    const updatedCustomer = await Customer.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    // Save the changes to the customerHistory collection if there are any
    if (changes.length > 0) {
      await CustomerHistory.insertMany(changes);
    }

    res.status(200).json({ success: true, message: "Customer updated successfully", updatedCustomer });
  } catch (error) {
    console.error(error);
    res.status(500).json({success: false, error: "Error updating customer: " + error.message });
  }
};
