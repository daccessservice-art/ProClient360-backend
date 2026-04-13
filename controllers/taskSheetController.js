const TaskSheet = require("../models/taskSheetModel");
const jwt = require("jsonwebtoken");
const Action = require("../models/actionModel");
const Project = require('../models/projectModel');
const Designation = require('../models/designationModel');
const Employee = require('../models/employeeModel');
const { newTaskAssignedMail } = require("../mailsService/newTaskAssign");
const { taskCompletedMail } = require("../mailsService/taskCompletedMail");
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
      return res.status(404).json({ success: false, error: "No Task Found" });
    }
    
    res.status(200).json({
      task,
      totalRecord: task.length,
      success: true,
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

    let query = {
      company: user.company ? user.company : user._id,
      project: id
    };

    if (user.company) {
      try {
        const employeeDoc = await Employee.findById(user._id).populate('designation');
        const hasViewTaskSheet = employeeDoc?.designation?.permissions?.includes('viewTaskSheet');
        if (!hasViewTaskSheet) {
          query.employees = user._id;
        }
      } catch (err) {
        query.employees = user._id;
      }
    }

    const task = await TaskSheet.find(query)
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
      .sort({ startDate: 1 });

    if (task.length <= 0) {
      return res.status(404).json({ success: false, error: "No Task Found" });
    }
    
    res.status(200).json({ success: true, task });
  } catch (error) {
    res.status(500).json({ error: "Error while getting taskSheet using id: " + error.message });
  }
};

exports.myTask = async (req, res) => {
  try {
    const user = req.user;
    const { projectId } = req.params;

    const query = {
      employees: user._id,
      project: projectId
    };

    if (user.company) {
      query.company = user.company;
    }

    const task = await TaskSheet.find(query)
      .populate('taskName', 'name')
      .populate('assignedBy', 'name');

    res.status(200).json({
      task: task || [],
      success: true,
      totalRecord: task ? task.length : 0,
    });

  } catch (error) {
    res.status(500).json({ error: "Error in myTask controller: " + error.message });
  }
};

// ✅ NEW: Send completion email to the person who assigned the task
exports.notifyCompletion = async (req, res) => {
  try {
    const { taskId, assignedById, employeeId, taskName } = req.body;

    if (!taskId || !assignedById) {
      return res.status(400).json({ success: false, error: "taskId and assignedById are required" });
    }

    // Fetch task details
    const task = await TaskSheet.findById(taskId)
      .populate('taskName', 'name')
      .populate('project', 'name')
      .populate('employees', 'name');

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // Only send if task is actually 100% complete
    if (task.taskLevel !== 100) {
      return res.status(200).json({ success: false, message: "Task is not yet 100% complete, no email sent" });
    }

    // Get the assigner's details
    const assigner = await Employee.findById(assignedById).select('name email');
    if (!assigner || !assigner.email) {
      return res.status(404).json({ success: false, error: "Assigner not found or has no email" });
    }

    // Get assigned employee details
    const employee = await Employee.findById(employeeId).select('name');

    // Send completion mail to the assigner
    await taskCompletedMail({
      assignerEmail: assigner.email,
      assignerName: assigner.name,
      employeeName: employee?.name || 'An employee',
      taskName: task.taskName?.name || taskName || 'Task',
      projectName: task.project?.name || 'Project',
      startDate: task.startDate,
      endDate: task.endDate,
    });

    res.status(200).json({ success: true, message: "Completion notification sent successfully" });
  } catch (error) {
    console.error("Error in notifyCompletion:", error);
    res.status(500).json({ error: "Error sending completion notification: " + error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { project, employees, taskName, startDate, endDate, remark, priority } = req.body;
    const user = req.user;

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
      if (existingProject.projectStatus === 'upcoming') {
        existingProject.projectStatus = 'inprocess';
        await existingProject.save();
      }

      const populatedTask = await TaskSheet.findById(task._id)
        .populate('taskName', 'name')
        .populate('employees', 'name')
        .populate('project', 'name')
        .populate('assignedBy', 'name');
      
      await logCreation(populatedTask, user, req, 'Task');

      if (employees && Array.isArray(employees)) {
        for (const employeeId of employees) {
          try {
            const employee = await Employee.findById(employeeId);
            if (employee) {
              const { logAssignment } = require('../helpers/activityLogHelper');
              await logAssignment(populatedTask, employee, user, req, 'Task');
              newTaskAssignedMail(employeeId, task, existingProject.name);
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

    const oldEmployeeIds = oldTaskData.employees;
    const newEmployeeIds = updateData.employees ? updateData.employees.map(id => id.toString()).sort() : oldEmployeeIds;
    const employeesChanged = JSON.stringify(oldEmployeeIds) !== JSON.stringify(newEmployeeIds);
    
    delete updateData.company;
    delete updateData.assignedBy;
    
    const task = await TaskSheet.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    )
    .populate('taskName', 'name')
    .populate('employees', 'name')
    .populate('assignedBy', 'name')
    .populate('project', 'name');

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

    if (employeesChanged) {
      const oldTaskWithoutEmployees = { ...oldTaskData };
      const updatedTaskWithoutEmployees = { ...updatedTask };
      delete oldTaskWithoutEmployees.employees;
      delete updatedTaskWithoutEmployees.employees;
      await logUpdate(oldTaskWithoutEmployees, updatedTaskWithoutEmployees, user, req, 'Task');
    } else {
      await logUpdate(oldTaskData, updatedTask, user, req, 'Task');
    }

    if (employeesChanged) {
      const { logAssignment } = require('../helpers/activityLogHelper');
      
      const addedEmployeeIds = newEmployeeIds.filter(id => !oldEmployeeIds.includes(id));
      const removedEmployeeIds = oldEmployeeIds.filter(id => !newEmployeeIds.includes(id));
      
      for (const employeeId of addedEmployeeIds) {
        try {
          const employee = await Employee.findById(employeeId);
          if (employee) {
            await logAssignment(task, employee, user, req, 'Task');
          }
        } catch (error) {
          console.error('Error logging employee assignment:', error);
        }
      }
      
      for (const employeeId of removedEmployeeIds) {
        try {
          const employee = await Employee.findById(employeeId);
          if (employee) {
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
          }
        } catch (error) {
          console.error('Error logging employee removal:', error);
        }
      }
    }

    // ✅ If task just reached 100%, send completion email to assignedBy
    if (task.taskLevel === 100 && existingTask.taskLevel < 100 && task.assignedBy) {
      try {
        const assigner = await Employee.findById(task.assignedBy._id || task.assignedBy).select('name email');
        if (assigner && assigner.email) {
          await taskCompletedMail({
            assignerEmail: assigner.email,
            assignerName: assigner.name,
            employeeName: task.employees?.map(e => e.name).join(', ') || 'Employee',
            taskName: task.taskName?.name || 'Task',
            projectName: task.project?.name || 'Project',
            startDate: task.startDate,
            endDate: task.endDate,
          });
          console.log(`Completion email sent to assigner: ${assigner.email}`);
        }
      } catch (mailErr) {
        console.error("Failed to send completion email:", mailErr);
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

    const task = await TaskSheet.findById(taskSheetId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "TaskSheet not found"
      });
    }

    await logDeletion(task, user, req, 'Task');
    await TaskSheet.findByIdAndDelete(taskSheetId);
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