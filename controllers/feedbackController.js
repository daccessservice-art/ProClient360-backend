const jwt = require("jsonwebtoken");
const Feedback = require("../models/feedbackModel");
const Service = require("../models/serviceModel");
const Employee = require("../models/employeeModel");
const { sendFeedbackNotification } = require("../mailsService/feedbackEmailService");

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { company: user.company ? user.company : user._id };

    const feedbacks = await Feedback.find(query)
      .skip(skip)
      .limit(limit)
      .populate("service")
      .lean();

    const totalRecords = await Feedback.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      feedbacks: feedbacks || [],
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
    console.error("Error while fetching feedbacks: ", error);
    res.status(500).json({
      success: false,
      error: "Error while fetching the Feedbacks: " + error.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    const { rating, message, service, submitBy } = req.body;
    const existingService = await Service.findById(service).populate('allotTo');
    if (!existingService) {
      return res.status(404).json({success: false,  error: "Invalid Ticket" });
    }
    let token;
    let user;
    if (submitBy === "Employee") {
      token =
        req.headers["authorization"] &&
        req.headers["authorization"].split(" ")[1];
      if (!token) {
        return res
          .status(403)
          .json({ error: "Unauthorized you need to login first" });
      }
      const userId = jwt.verify(
        token,
        process.env.JWT_SECRET
      ).user;

      user = await Employee.findById(userId);
      if (!user) {
        return res.status(404).json({ success:false, error: "Invalid Employee" });
      }
    }

    if (existingService.feedback) {
      return res
        .status(400)
        .json({ success:false, error: "Feedback already given for this ticket" });
    }
    
    const newFeedback = new Feedback({
      rating,
      message,
      service,
      submmitedBy: submitBy === "Employee" ? user._id : null,
      company: existingService.company,
    });

    existingService.feedback = newFeedback._id;

    await newFeedback.save();
    await existingService.save();
    
    // Send email notifications to engineers and company
    try {
      // Prepare data for email notification
      const emailData = {
        rating,
        message,
        service: existingService,
        submitBy,
        isNewFeedback: true
      };
      
      // Send email notifications (don't await to avoid blocking the response)
      sendFeedbackNotification(emailData)
        .then(result => {
          if (!result.success) {
            console.error("Failed to send email notifications:", result.error);
          } else {
            console.log("Email notifications sent successfully");
          }
        })
        .catch(error => {
          console.error("Error sending email notifications:", error);
        });
    } catch (emailError) {
      console.error("Error setting up email notifications:", emailError);
    }
    
    res.status(200).json({ success:true,message: "Thank you for your valueable feedback" });
  } catch (error) {
    console.log("Error while creating Feedback: " + error);
    res.status(500).json({
      success: false,
      error: "Error while creating feedback: " + error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { rating, message, service, submitBy } = req.body;
    const existingService = await Service.findById(service).populate('allotTo');
    if (!existingService) {
      return res.status(404).json({success: false,  error: "Invalid Ticket" });
    }
    
    let token;
    let user;
    if (submitBy === "Employee") {
      token =
        req.headers["authorization"] &&
        req.headers["authorization"].split(" ")[1];
      if (!token) {
        return res
          .status(403)
          .json({ error: "Unauthorized you need to login first" });
      }
      const userId = jwt.verify(
        token,
        process.env.JWT_SECRET
      ).user;

      user = await Employee.findById(userId);
      if (!user) {
        return res.status(404).json({ success:false, error: "Invalid Employee" });
      }
    }

    // Check if feedback exists
    if (!existingService.feedback) {
      // If no feedback exists, create a new one
      const newFeedback = new Feedback({
        rating,
        message,
        service,
        submmitedBy: submitBy === "Employee" ? user._id : null,
        company: existingService.company,
      });

      existingService.feedback = newFeedback._id;

      await newFeedback.save();
      await existingService.save();
      
      // Send email notifications to engineers and company
      try {
        // Prepare data for email notification
        const emailData = {
          rating,
          message,
          service: existingService,
          submitBy,
          isNewFeedback: true
        };
        
        // Send email notifications (don't await to avoid blocking the response)
        sendFeedbackNotification(emailData)
          .then(result => {
            if (!result.success) {
              console.error("Failed to send email notifications:", result.error);
            } else {
              console.log("Email notifications sent successfully");
            }
          })
          .catch(error => {
            console.error("Error sending email notifications:", error);
          });
      } catch (emailError) {
        console.error("Error setting up email notifications:", emailError);
      }
      
      res.status(200).json({ success:true, message: "Feedback created successfully" });
    } else {
      // If feedback exists, update it
      const existingFeedback = await Feedback.findById(existingService.feedback);
      if (!existingFeedback) {
        return res.status(404).json({ success:false, error: "Feedback not found" });
      }
      
      // Store previous rating for comparison
      const previousRating = existingFeedback.rating;
      
      // Update the feedback
      existingFeedback.rating = rating;
      existingFeedback.message = message;
      
      await existingFeedback.save();
      
      // Send email notifications to engineers and company
      try {
        // Prepare data for email notification
        const emailData = {
          rating,
          message,
          service: existingService,
          submitBy,
          isNewFeedback: false,
          previousRating
        };
        
        // Send email notifications (don't await to avoid blocking the response)
        sendFeedbackNotification(emailData)
          .then(result => {
            if (!result.success) {
              console.error("Failed to send email notifications:", result.error);
            } else {
              console.log("Email notifications sent successfully");
            }
          })
          .catch(error => {
            console.error("Error sending email notifications:", error);
          });
      } catch (emailError) {
        console.error("Error setting up email notifications:", emailError);
      }
      
      res.status(200).json({ success:true, message: "Feedback updated successfully" });
    }
  } catch (error) {
    console.log("Error while updating Feedback: " + error);
    res.status(500).json({
      success: false,
      error: "Error while updating feedback: " + error.message,
    });
  }
};

exports.feedback = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const {q} = req.query;

    // Base query for services - both with and without feedback
    const baseQuery = { 
      company: user.company ? user.company : user._id,
      status: "Completed"
    };

    let services;
    let totalRecords;

    if (
      q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"
    ) {
      console.log("Searching for:", q);
      // For search, we need to use aggregation pipeline to filter by populated fields
      const searchRegex = new RegExp(q, "i");
      
      const aggregatePipeline = [
        { $match: baseQuery },
        {
          $lookup: {
            from: "tickets",
            localField: "ticket",
            foreignField: "_id",
            as: "ticket"
          }
        },
        { $unwind: "$ticket" },
        {
          $lookup: {
            from: "customers", // Adjust collection name as needed
            localField: "ticket.client",
            foreignField: "_id",
            as: "ticket.client"
          }
        },
        { $unwind: "$ticket.client" },
        {
          $lookup: {
            from: "employees", // For allotTo field
            localField: "allotTo",
            foreignField: "_id",
            as: "allotTo"
          }
        },
        {
          $match: {
            $or: [
              { "ticket.client.custName": { $regex: searchRegex } },
              { "ticket.contactPerson": { $regex: searchRegex } },
              { "ticket.product": { $regex: searchRegex } },
              { "ticket.contactNumber": { $regex: searchRegex } }
            ]
          }
        },
        {
          $project: {
            _id: 1,
            allotmentDate: 1,
            completionDate: 1,
            status: 1,
            feedback: 1,
            company: 1,
            "ticket._id": 1,
            "ticket.details": 1,
            "ticket.product": 1,
            "ticket.date": 1,
            "ticket.contactNumber": 1,
            "ticket.contactPerson": 1,
            "ticket.client._id": 1,
            "ticket.client.custName": 1,
            "allotTo._id": 1,
            "allotTo.name": 1
          }
        },
        { $skip: skip },
        { $limit: limit }
      ];

      // Get total count for search
      const countPipeline = [
        { $match: baseQuery },
        {
          $lookup: {
            from: "tickets",
            localField: "ticket",
            foreignField: "_id",
            as: "ticket"
          }
        },
        { $unwind: "$ticket" },
        {
          $lookup: {
            from: "customers",
            localField: "ticket.client",
            foreignField: "_id",
            as: "ticket.client"
          }
        },
        { $unwind: "$ticket.client" },
        {
          $match: {
            $or: [
              { "ticket.client.custName": { $regex: searchRegex } },
              { "ticket.contactPerson": { $regex: searchRegex } },
              { "ticket.product": { $regex: searchRegex } },
              { "ticket.contactNumber": { $regex: searchRegex } }
            ]
          }
        },
        { $count: "total" }
      ];

      services = await Service.aggregate(aggregatePipeline);
      const countResult = await Service.aggregate(countPipeline);
      totalRecords = countResult.length > 0 ? countResult[0].total : 0;

      console.log("Search results:", services);
      console.log("Total records:", totalRecords);

    } else {
      // Regular query without search
      services = await Service.find(baseQuery)
        .skip(skip)
        .limit(limit)
        .populate("allotTo", "name")
        .populate({
          path: "ticket",
          select: "details product date client contactNumber contactPerson",
          populate: {
            path: "client",
            select: "custName",
          }
        })
        .populate("feedback") // Populate feedback details
        .lean();

      totalRecords = await Service.countDocuments(baseQuery);
    }

    // Always return a success response, even with empty results
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      services: services || [],
      currentPage: page,
      totalPages,
      totalRecords,
      limit,
      hasNextPage,
      hasPrevPage,
    });
  } catch (error) {
    console.error("Error while getting feedback: ", error);
    res.status(500).json({
      success: false,
      error: "Error while getting feedback: " + error.message,
    });
  }
};