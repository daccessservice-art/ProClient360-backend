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
    .populate("assignedBy", "name")
    .populate("taskName", "name");

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
      error: "Error while fetching the Task Sheets: " + error.message,
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
    .populate('assignedBy', 'name')
    .sort({startDate: 1});

    if (task.length <= 0) {
      return res.status(404).json({success:false, error: "No Task Found " });
    }
    
    res.status(200).json({success:true, task });
  } catch (error) {
    res.status(500).json({error:"Error while getting taskSheet using id: "+error.message});
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
    .populate('assignedBy', 'name');

    if (task.length <= 0) {
      return res.status(404).json({success:false, error: "There is no task" });
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
    const { project, employees, taskName, startDate, endDate, remark, priority } = req.body;
    const user = req.user;

    console.log("Creating task sheet with user:", user._id);

    // Validate required fields
    if (!project || !employees || !taskName || !startDate || !endDate || !priority) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided"
      });
    }

    // Validate employees array
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one employee must be assigned"
      });
    }

    // Validate priority
    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        success: false,
        error: "Invalid priority value"
      });
    }

    // Check if project exists
    const existingProject = await Project.findById(project);
    if (!existingProject) {
      return res.status(404).json({ 
        success: false, 
        error: "Project not found" 
      });
    }

    // Create task sheet with all fields including priority
    const task = await TaskSheet.create({
      employees,
      taskName,
      project,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      remark,
      priority, // Include priority
      company: user.company ? user.company : user._id,
      assignedBy: user._id
    });

    if (task) {
      // Update project status if it's still 'upcoming'
      if(existingProject.projectStatus === 'upcoming'){
        existingProject.projectStatus = 'inprocess';
        await existingProject.save();
      }

      // Send emails to assigned employees (if email service is configured)
      if (employees && Array.isArray(employees)) {
        employees.forEach(employee => {
          try {
            newTaskAssignedMail(employee, task, existingProject.name);
          } catch (emailError) {
            console.error("Failed to send email:", emailError);
            // Continue even if email fails
          }
        });
      }

      return res.status(201).json({
        success: true,
        message: "TaskSheet created successfully",
        data: task
      });
    }
  } catch (error) {
    console.error("Error creating task sheet:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Duplicate entry found"
      });
    }
    
    res.status(500).json({ 
      error: "Error while creating taskSheet: " + error.message 
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Don't allow updating certain fields
    delete updateData.company;
    delete updateData.assignedBy;
    
    const task = await TaskSheet.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    )
    .populate('taskName', 'name')
    .populate('employees', 'name')
    .populate('assignedBy', 'name');

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "TaskSheet not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "TaskSheet updated successfully",
      data: task
    });
  } catch (error) {
    console.error("Error updating task sheet:", error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
    res.status(500).json({ 
      error: "Error while updating Task Sheet: " + error.message 
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const taskSheetId = req.params.id;

    const task = await TaskSheet.findByIdAndDelete(taskSheetId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "TaskSheet not found"
      });
    }

    // Delete associated actions
    await Action.deleteMany({ task: taskSheetId });

    res.status(200).json({
      success: true,
      message: "TaskSheet and associated actions deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting task sheet:", error);
    res.status(500).json({ 
      error: "Error while deleting TaskSheet: " + error.message 
    });
  }
};