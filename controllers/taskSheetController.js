const TaskSheet = require("../models/taskSheetModel");
const jwt = require("jsonwebtoken");
const Action = require("../models/actionModel");
const Project = require('../models/projectModel');
const { newTaskAssignedMail } = require("../mailsService/newTaskAssign");
const { logCreation, logUpdate, logDeletion } = require('../helpers/activityLogHelper');

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

    if (!project || !employees || !taskName || !startDate || !endDate || !priority) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided"
      });
    }

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one employee must be assigned"
      });
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({
        success: false,
        error: "Invalid priority value"
      });
    }

    const existingProject = await Project.findById(project);
    if (!existingProject) {
      return res.status(404).json({ 
        success: false, 
        error: "Project not found" 
      });
    }

    const task = await TaskSheet.create({
      employees,
      taskName,
      project,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      remark,
      priority,
      company: user.company ? user.company : user._id,
      assignedBy: user._id
    });

    if (task) {
      if(existingProject.projectStatus === 'upcoming'){
        existingProject.projectStatus = 'inprocess';
        await existingProject.save();
      }

      // *** LOG ACTIVITY - TaskSheet Creation ***
      console.log('=== LOGGING TASKSHEET CREATION ===');
      console.log('Task created:', task._id);
      console.log('User:', user.name);
      console.log('Assigned to employees:', employees);
      
      // Populate task details for better logging
      const populatedTask = await TaskSheet.findById(task._id)
        .populate('taskName', 'name')
        .populate('employees', 'name')
        .populate('project', 'name')
        .populate('assignedBy', 'name');
      
      await logCreation(populatedTask, user, req, 'Task');

      // Log each employee assignment
      if (employees && Array.isArray(employees)) {
        const Employee = require('../models/employeeModel');
        
        for (const employeeId of employees) {
          try {
            const employee = await Employee.findById(employeeId);
            if (employee) {
              // Log assignment for each employee
              const { logAssignment } = require('../helpers/activityLogHelper');
              await logAssignment(populatedTask, employee, user, req, 'Task');
              
              // Send email notification
              newTaskAssignedMail(employeeId, task, existingProject.name);
              
              console.log(`Task assigned to employee: ${employee.name}`);
            }
          } catch (emailError) {
            console.error("Failed to send email:", emailError);
          }
        }
      }

      return res.status(201).json({
        success: true,
        message: "TaskSheet created successfully",
        data: populatedTask
      });
    }
  } catch (error) {
    console.error("Error creating task sheet:", error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: errors.join(', ')
      });
    }
    
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
    const user = req.user;
    const updateData = req.body;
    
    console.log('=== UPDATE TASKSHEET START ===');
    console.log('TaskSheet ID:', id);
    console.log('Update Data:', updateData);
    console.log('User:', user.name);
    
    // Find existing task with populated fields
    const existingTask = await TaskSheet.findById(id)
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('project', 'name')
      .populate('assignedBy', 'name');
      
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        error: "TaskSheet not found"
      });
    }

    // *** STORE OLD DATA FOR LOGGING - CONVERT TO PLAIN OBJECT ***
    const oldTaskData = {
      taskName: existingTask.taskName ? existingTask.taskName._id.toString() : null,
      project: existingTask.project ? existingTask.project._id.toString() : null,
      employees: existingTask.employees ? existingTask.employees.map(emp => emp._id.toString()).sort() : [],
      startDate: existingTask.startDate,
      endDate: existingTask.endDate,
      priority: existingTask.priority,
      remark: existingTask.remark,
      taskStatus: existingTask.taskStatus,
      taskLevel: existingTask.taskLevel,
      _id: existingTask._id
    };

    console.log('=== OLD TASK DATA ===');
    console.log(JSON.stringify(oldTaskData, null, 2));
    
    // Check if employees are being updated
    const oldEmployeeIds = oldTaskData.employees;
    const newEmployeeIds = updateData.employees ? updateData.employees.map(id => id.toString()).sort() : oldEmployeeIds;
    const employeesChanged = JSON.stringify(oldEmployeeIds) !== JSON.stringify(newEmployeeIds);
    
    console.log('Employees changed:', employeesChanged);
    console.log('Old employees:', oldEmployeeIds);
    console.log('New employees:', newEmployeeIds);
    
    // Remove fields that shouldn't be updated
    delete updateData.company;
    delete updateData.assignedBy;
    
    // Update the task
    const task = await TaskSheet.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    )
    .populate('taskName', 'name')
    .populate('employees', 'name')
    .populate('assignedBy', 'name')
    .populate('project', 'name');

    // *** CONVERT TO PLAIN OBJECT FOR LOGGING ***
    const updatedTask = {
      taskName: task.taskName ? (task.taskName._id ? task.taskName._id.toString() : task.taskName.toString()) : null,
      project: task.project ? (task.project._id ? task.project._id.toString() : task.project.toString()) : null,
      employees: task.employees ? task.employees.map(emp => emp._id.toString()).sort() : [],
      startDate: task.startDate,
      endDate: task.endDate,
      priority: task.priority,
      remark: task.remark,
      taskStatus: task.taskStatus,
      taskLevel: task.taskLevel,
      _id: task._id
    };

    console.log('=== NEW TASK DATA ===');
    console.log(JSON.stringify(updatedTask, null, 2));

    // *** LOG ACTIVITY - TaskSheet Update ***
    // If employees changed, we'll log that separately as ASSIGN actions
    // So we need to exclude 'employees' field from the general UPDATE log
    console.log('=== CALLING LOG UPDATE ===');
    
    if (employeesChanged) {
      // Create temporary objects without employees field for comparison
      const oldTaskWithoutEmployees = { ...oldTaskData };
      const updatedTaskWithoutEmployees = { ...updatedTask };
      delete oldTaskWithoutEmployees.employees;
      delete updatedTaskWithoutEmployees.employees;
      
      console.log('Employees changed - logging UPDATE without employees field');
      await logUpdate(oldTaskWithoutEmployees, updatedTaskWithoutEmployees, user, req, 'Task');
    } else {
      // No employee changes, log all changes normally
      await logUpdate(oldTaskData, updatedTask, user, req, 'Task');
    }
    
    console.log('=== LOG UPDATE COMPLETE ===');

    // *** LOG EMPLOYEE ASSIGNMENT/REASSIGNMENT IF CHANGED ***
    if (employeesChanged) {
      console.log('=== LOGGING EMPLOYEE CHANGES ===');
      
      const Employee = require('../models/employeeModel');
      const { logAssignment } = require('../helpers/activityLogHelper');
      
      // Find newly added employees
      const addedEmployeeIds = newEmployeeIds.filter(id => !oldEmployeeIds.includes(id));
      const removedEmployeeIds = oldEmployeeIds.filter(id => !newEmployeeIds.includes(id));
      
      console.log('Added employees:', addedEmployeeIds);
      console.log('Removed employees:', removedEmployeeIds);
      
      // Log assignments for newly added employees
      for (const employeeId of addedEmployeeIds) {
        try {
          const employee = await Employee.findById(employeeId);
          if (employee) {
            await logAssignment(task, employee, user, req, 'Task');
            console.log(`Task assigned to new employee: ${employee.name}`);
          }
        } catch (error) {
          console.error('Error logging employee assignment:', error);
        }
      }
      
      // Log reassignment for removed employees
      for (const employeeId of removedEmployeeIds) {
        try {
          const employee = await Employee.findById(employeeId);
          if (employee) {
            // Log as reassignment (removal)
            const ActivityLog = require('../models/activityLogModel');
            await ActivityLog.create({
              company: task.company,
              entityType: 'Task',
              entityId: task._id,
              actionType: 'REASSIGN',
              actionBy: user._id,
              actionByName: user.name,
              changes: [{
                field: 'employees',
                oldValue: employee.name,
                newValue: 'Removed'
              }],
              description: `Task unassigned from ${employee.name}`,
              metadata: {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent']
              }
            });
            console.log(`Task unassigned from employee: ${employee.name}`);
          }
        } catch (error) {
          console.error('Error logging employee removal:', error);
        }
      }
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
    const user = req.user;

    console.log('=== DELETE TASKSHEET START ===');
    console.log('TaskSheet ID:', taskSheetId);
    console.log('User:', user.name);

    const task = await TaskSheet.findById(taskSheetId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "TaskSheet not found"
      });
    }

    // *** LOG ACTIVITY - TaskSheet Deletion ***
    console.log('=== LOGGING TASKSHEET DELETION ===');
    await logDeletion(task, user, req, 'Task');

    await TaskSheet.findByIdAndDelete(taskSheetId);
    await Action.deleteMany({ task: taskSheetId });

    console.log('=== DELETE TASKSHEET COMPLETE ===');

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