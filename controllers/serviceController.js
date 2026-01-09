const Service = require("../models/serviceModel");
const Ticket = require("../models/ticketModel");
const {ticketProcessMail} = require('../mailsService/ticketProcessMail');
const ServiceAction = require("../models/serviceActionModel");
const {Types} = require("mongoose");

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;

    let query = { company:new Types.ObjectId(user.company || user._id)};

    const {q} = req.query;

    const { serviceType, status, priority } = req.query;
    
    const validServiceTypes = ['AMC', 'Warranty', 'One Time'];
    const validStatuses = ['Pending', 'Inprogress', 'Completed', 'Stuck'];
    const validPriorities = ['High', 'Medium', 'Low'];

    const totalRecords = await Service.countDocuments(query);
    
    // Apply filters to the query if provided
    if (serviceType && validServiceTypes.includes(serviceType)) {
      query.serviceType = serviceType;
    }
    if (status && validStatuses.includes(status)) {
      query.status = status;
    }
    if (priority && validPriorities.includes(priority)) {
      query.priority = priority;
    }

    let populateOptions = {
      path: "ticket",
      select: "details product date client",
      populate: {
        path: "client",
        select: "custName",
      },
    };

    if (
      q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"
    ) {
      skip = 0;
      page = 1;
      const searchRegex = new RegExp(q, "i");
      // Use populate match to filter client by custName
      populateOptions.populate.match = { custName: { $regex: searchRegex } };
    }

    // Fetch services with pagination
    const services = await Service.find(query)
      .skip(skip)
      .limit(limit)
      .populate("allotTo", "name")
      .populate(populateOptions)
       .sort({ allotmentDate: -1 })
      .lean();

    // Filter out services where ticket.client is null due to populate match
    // const filteredServices = services.filter(service => service.ticket && service.ticket.client);

    // if (filteredServices.length <= 0) {
    //   return res.status(404).json({success:false, error: "No Services Available" });
    // }


    const statusCounts = await Service.aggregate([
      {
        $match: {
          company:new Types.ObjectId(user.company || user._id),
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);


    // Format the status counts into an object
    const counts = {
      Pending: 0,
      Inprogress: 0,
      Completed: 0,
      Stuck: 0,
    };

    statusCounts.forEach(item => {
      counts[item._id] = item.count;
    });


    // Pagination details
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Send response
    res.status(200).json({
      success: true,
      services: services,
      statusCounts: counts, // Include status counts in the response
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
    console.error("Error fetching services:", error);
    res
      .status(500)
      .json({ error: "Error while fetching the Services: " + error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      serviceType,
      priority,
      allotmentDate,
      allotTo,
      workMode,
      status
    } = req.body;
    const updatedData = {
      serviceType,
      priority,
      allotmentDate,
      allotTo,
      workMode,
      status
    };
    const service = await Service.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: false,
    });



    await service.save();

    if (!service) {
      return res.status(404).json({success:false, error: "Service not found..." });
    }
    res.status(200).json({success:true, message: "Service Updated Successfully" });
  } catch (error) {
    res
      .status(500)
      .json({success: false, error: "Error while Updating the Service : " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const user=req.user;

    const {
      serviceType,
      ticket,
      priority,
      allotmentDate,
      allotTo,
      workMode,
      status,
    } = req.body;
    const ticketData = await Ticket.findById(ticket);

    if(!allotTo){
      return res.status(400).json({success:false, error: "Allot To field is required" });
    }
    const service = new Service({
      company: user.company ? user.company : user._id,
      serviceType,
      ticket,
      priority,
      allotmentDate,
      allotTo,
      workMode,
      status,
    });
    await service.save();
    ticketData.service = service._id;
    await ticketData.save();
    // send ticket allotment mail here
    ticketProcessMail(service._id);
    res.status(200).json({success:true, message: "Service Assigned Successfully." });
  } catch (error) {
    res
      .status(500)
      .json({success: false, error: "Error while Creating the Service : " + error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findByIdAndDelete(id);
    if (!service) {
      return res.status(404).json({success:false, error: "Service not found..." });
    }
    await Ticket.deleteMany({service:id});

    await ServiceAction.deleteMany({service:id});
    res.status(200).json({success:true, message: "Service Deleted..." });
  } catch (error) {
    res
      .status(500)
      .json({success: false, error: "Error while Deleting the Service : " + error.message });
  }
};

exports.myServices = async (req, res) => {
  try {
    const userId = req.user._id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = { allotTo: userId };

    const {q} = req.query;
    const { serviceType, status, priority } = req.query;
    
    const validServiceTypes = ['AMC', 'Warranty', 'One Time'];
    const validStatuses = ['Pending', 'Inprogress', 'Completed', 'Stuck'];
    const validPriorities = ['High', 'Medium', 'Low'];

    if (serviceType && validServiceTypes.includes(serviceType)) {
      query.serviceType = serviceType;
    }
    if (status && validStatuses.includes(status)) {
      query.status = status;
    }
    if (priority && validPriorities.includes(priority)) {
      query.priority = priority;
    }

    // COUNT TOTAL BEFORE PAGINATION - THIS IS CRITICAL
    const totalRecords = await Service.countDocuments(query);

    let populateOptions = {
      path: "ticket",
      select: "details product date client contactPerson contactNumber Address",
      populate: {
        path: "client",
        select: "custName",
      },
    };

    if (q !== undefined && q !== null && q.trim() !== "" && q.trim().toLowerCase() !== "null" && q.trim().toLowerCase() !== "undefined") {
      const searchRegex = new RegExp(q, "i");
      populateOptions.populate.match = { custName: { $regex: searchRegex } };
    }

    const services = await Service.find(query)
      .skip(skip)
      .limit(limit)
      .populate("allotTo", "name")
      .populate(populateOptions)
      .sort({ allotmentDate: -1 })
      .lean();

    const filteredServices = services.filter(service => service.ticket && service.ticket.client);

    if (filteredServices.length <= 0) {
      return res.status(404).json({ 
        success: false,
        error: "No Services Available",
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalRecords: 0,
          limit,
          hasNextPage: false,
          hasPrevPage: false,
        }
      });
    }

    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      services: filteredServices,
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
    console.error("Error fetching services:", error);
    res.status(500).json({ 
        success: false,
        error: "Error while fetching the employee Services : " + error.message 
      });
  }
};