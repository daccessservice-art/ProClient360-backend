const TaskSheet = require("../models/taskSheetModel");
const jwt = require("jsonwebtoken");
const Action = require("../models/actionModel");
const Project = require('../models/projectModel');
const { newTaskAssignedMail } = require("../mailsService/newTaskAssign");

exports.showAll = async (req, res) => {
  try {
    const user = req.user;
  
    const task = await TaskSheet.find({
      company: user.company ? user.company : user._id,
    })
    .populate("project", "name")
    .populate("assignedBy", "name"); // Add this line

    if (task.length <= 0) {
      return res.status(404).json({success:false, error: "No Task Found " });
    }
    res.status(200).json({
      task,
      totalRecord: task.length,
      success:true,
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while featching the Task Sheets: " + error.message,
    });
  }
};

exports.getTaskSheet = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    
    const task = await TaskSheet.find({
      company: user.company ? user.company : user._id,
      project: id
    })
    .populate({
      path: 'project',
      select: 'name startDate endDate completeLevel custId', 
      populate: {
        path: 'custId', 
        select: 'custName' 
      }
    })
    .populate('taskName', 'name')
    .populate('employees', 'name')
    .populate('assignedBy', 'name') // Make sure this is included
    .sort({startDate: 1});

    console.log("Task sheets with assignedBy:", JSON.stringify(task, null, 2)); // Debug log

    if (task.length <= 0) {
      return res.status(404).json({success:false, error: "No Task Found " });
    }
    res.status(200).json({success:true, task });
  } catch (error) {
    res.status(500).json({error:"Error while getting taskheet using id: "+error.message});
  }
};

exports.myTask = async (req, res) => {
  try {
    const user = req.user;
    const {projectId} = req.params;
    
    const task = await TaskSheet.find({
      company: user.company,
      employees: user._id,
      project: projectId
    })
    .populate('taskName', 'name')
    .populate('assignedBy', 'name'); // Add this line

    if (task.length <= 0) {
      return res.status(404).json({success:false, error: "Their is no task" });
    }
    res.status(200).json({
      task,
      success:true,
      totalRecord: task.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Error in myTask controller: " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { project, employees, taskName, startDate, endDate, remark } = req.body;
    const user = req.user;

    console.log("Creating task sheet with user:", user._id); // Debug log

    const existingProject = await Project.findById(project);

    if (!existingProject) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Create task sheet with assignedBy set to current user
    const task = await TaskSheet.create({
      employees,
      taskName,
      project,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      remark,
      company: user.company ? user.company : user._id,
      assignedBy: user._id // Set the current user as assigner
    });

    if (task) {
      if(existingProject.projectStatus === 'upcoming'){
        existingProject.projectStatus = 'inprocess';
        await existingProject.save();
      }

      // Send emails to assigned employees
      employees.map(employee => {
        newTaskAssignedMail(employee, task, existingProject.name);
      });

      return res.status(201).json({
        success: true,
        message: "TaskSheet created successfully",
      });
    }
  } catch (error) {
    console.error("Error creating task sheet:", error); // Debug log
    res.status(500).json({ error: "Error while creating taskSheet: " + error.message });
  }
};

exports.update = async (req, res) => {
  try {
    res.status(200).json({ message: "Update functions is not done now"});
  } catch (error) {
    res.status(500).json({ error: "Error while Updating Task Sheet: " + error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const taskSheetId = req.params.id;

    const task = await TaskSheet.findByIdAndDelete(taskSheetId);

    if (!task) {
      return res.status(404).json({success:false, error: "TaskSheet not found" });
    }

    await Action.deleteMany({ task: taskSheetId });

    res.status(200).json({success:true, message: "TaskSheet and associated actions deleted" });
  } catch (error) {
    res.status(500).json({ error: "Error while deleting TaskSheet: " + error.message });
  }
};