const jwt = require("jsonwebtoken");
const moment = require("moment");

const Service = require("../models/serviceModel");
const ServiceAction = require("../models/serviceActionModel");
const {sendFeedbackMail} = require('../mailsService/sendFeedbackMail');

exports.showAll = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const serviceActions = await ServiceAction.find({ service: serviceId }).populate("actionBy", "name");

    if (serviceActions.length <= 0) {
      return res.status(404).json({ success: false, error: "No Actions Taken Before." });
    }
    res.status(200).json({serviceActions, success: true, message: "Service Actions fetched successfully..." });
  } catch (error) {
    res.status(500).json({
      error: "Error while featching the Service Actions : " + error.message,
    });
  }
};

exports.update = async (req,res)=>{
    try {
        const {id}= req.params;
        const {action,startTime,endTime} = req.body;
        const updatedData={
          action,
          startTime,
          endTime,
        }
        if(startTime > endTime){
          return res.status(400).json({success:false, error:"start time should not be greter then end time"});
        }
        const newAction = await ServiceAction.findByIdAndUpdate(id,updatedData,);
  
        if(newAction.length<=0){
            return res.status(404).json({success:false, error:"action not found..."});
        }
        res.status(200).json({success:true, message:"Action Updated..."});
    } catch (error) {
        res
      .status(500).json({
        error: "Error while Updating the Tasksheet Action : " + error.message,
      });
    }
}

exports.create = async (req, res) => {
  try {

    const { service, action, startTime, endTime, status, complateLevel, stuckReason, stuckResponsible, stuckBy } =req.body;
    const exesitingService = await Service.findById(service);

    if (!exesitingService) {
      return res.status(404).json({ success:false, error: "Service not found..." });
    }

    const actionData= {
      service,
      action: action? action : stuckReason,
      startTime,
      endTime,
      actionBy: req.user._id,
      actionStatus: status,
    }

    let completionDate = null;
    
    if(status==="Completed"){
      exesitingService.completionDate=endTime;
      exesitingService.days=moment(completionDate).diff(service.allotmentDate, "days");
      exesitingService.actualCompletionDate=new Date();
      exesitingService.complateLevel=100;
      sendFeedbackMail(service);
    }
    else if(status==="Stuck"){
      exesitingService.stuckReason=stuckReason;
      if(stuckBy==='Company')
        exesitingService.stuckResponsible=stuckResponsible;
      exesitingService.stuckBy=stuckBy;
    }
    exesitingService.status=status;
    exesitingService.complateLevel=complateLevel;
    
    const newServiceAction = await ServiceAction(actionData);
    if (!newServiceAction) {
      return res.status(400).json({ success: false, error: "Work was not Submitted" });
    }
    await newServiceAction.save();
    await exesitingService.save({validateBeforeSave: false});
    res.status(200).json({
      success: true, 
      message: "Work Submitted Successfully",
     });
  } catch (error) {
    console.error("Error in creating service action:", error);
    res.status(500).json({
      error: "Error while Creating the Service Action : " + error.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const serviceAction = await ServiceAction.findByIdAndDelete(id);
    if (!serviceAction) {
      return res.status(404).json({ success: false, error: "Service Action not found..." });
    }
    res.status(200).json({success:true, message: "Service Action Deleted Successfully..." });
  } catch (error) {
    res.status(500).json({
      error: "Error while deleting the Service Action : " + error.message,
    });
  }
};
