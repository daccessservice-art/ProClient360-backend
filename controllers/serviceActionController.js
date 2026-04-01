const moment = require("moment");

const Service       = require("../models/serviceModel");
const ServiceAction = require("../models/serviceActionModel");
const { sendFeedbackMail }            = require("../mailsService/sendFeedbackMail");
const { sendServiceActionReportMail } = require("../mailsService/serviceActionReportMail");


exports.showAll = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const serviceActions = await ServiceAction
      .find({ service: serviceId })
      .populate("actionBy", "name");

    if (serviceActions.length <= 0) {
      return res
        .status(404)
        .json({ success: false, error: "No Actions Taken Before." });
    }

    res.status(200).json({
      serviceActions,
      success: true,
      message: "Service Actions fetched successfully...",
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while fetching the Service Actions: " + error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, startTime, endTime } = req.body;

    if (startTime > endTime) {
      return res.status(400).json({
        success: false,
        error: "Start time should not be greater than end time",
      });
    }

    const updatedAction = await ServiceAction.findByIdAndUpdate(
      id,
      { action, startTime, endTime },
      { new: true }
    );

    if (!updatedAction) {
      return res
        .status(404)
        .json({ success: false, error: "Action not found..." });
    }

    res.status(200).json({ success: true, message: "Action Updated..." });
  } catch (error) {
    res.status(500).json({
      error: "Error while Updating the Service Action: " + error.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      service,
      action,
      startTime,
      endTime,
      status,
      complateLevel,
      stuckReason,
      stuckResponsible,
      stuckBy,
      suggestion,
      tentativeNextVisitDate,
    } = req.body;

    // Populate ticket → client so email helper can read email + details
    const existingService = await Service.findById(service)
      .populate({
        path: "ticket",
        select: "details product date client contactPersonEmail",
        populate: {
          path: "client",
          select: "custName email",
        },
      })
      .populate("company", "name landlineNo mobileNo");

    if (!existingService) {
      return res
        .status(404)
        .json({ success: false, error: "Service not found..." });
    }

    // ── Save action record ──
    const actionData = {
      service,
      action: action || stuckReason,
      startTime,
      endTime,
      actionBy:              req.user._id,
      actionStatus:          status,
      suggestion:            suggestion || "",
      tentativeNextVisitDate: tentativeNextVisitDate || null,
    };

    // ── Update service record ──
    if (status === "Completed") {
      existingService.completionDate      = endTime;
      existingService.days                = moment(endTime).diff(existingService.allotmentDate, "days");
      existingService.actualCompletionDate = new Date();
      existingService.complateLevel       = 100;
      sendFeedbackMail(service);
    } else if (status === "Stuck") {
      existingService.stuckReason = stuckReason;
      if (stuckBy === "Company")
        existingService.stuckResponsible = stuckResponsible;
      existingService.stuckBy = stuckBy;
    }

    existingService.status       = status;
    existingService.complateLevel = complateLevel;

    const newServiceAction = new ServiceAction(actionData);
    await newServiceAction.save();
    await existingService.save({ validateBeforeSave: false });

    // ── Send report email to client (non-blocking) ──
    sendServiceActionReportMail(existingService, {
      status,
      action,
      stuckReason,
      complateLevel,
      suggestion,
      tentativeNextVisitDate,
      startTime,
      endTime,
      actionByName: req.user?.name  || "",
      companyName:  existingService?.company?.name || "",
      companyPhone:
        existingService?.company?.landlineNo ||
        existingService?.company?.mobileNo   || "",
    });

    res.status(200).json({
      success: true,
      message: "Work Submitted Successfully",
    });
  } catch (error) {
    console.error("Error in creating service action:", error);
    res.status(500).json({
      error: "Error while Creating the Service Action: " + error.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceAction = await ServiceAction.findByIdAndDelete(id);
    if (!serviceAction) {
      return res
        .status(404)
        .json({ success: false, error: "Service Action not found..." });
    }
    res.status(200).json({
      success: true,
      message: "Service Action Deleted Successfully...",
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while deleting the Service Action: " + error.message,
    });
  }
};