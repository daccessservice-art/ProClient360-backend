const TaskSheet = require("../models/taskSheetModel");
const jwt = require("jsonwebtoken");
const Action = require("../models/actionModel");
const Project = require('../models/projectModel');
const Designation = require('../models/designationModel');
const Employee = require('../models/employeeModel');
const { newTaskAssignedMail } = require("../mailsService/newTaskAssign");
const { taskCompletedMail } = require("../mailsService/taskCompletedMail");
const { logCreation, logUpdate, logDeletion } = require('../helpers/activityLogHelper');

// ─── EXISTING: showAll ────────────────────────────────────────────────────────
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

    res.status(200).json({ task, totalRecord: task.length, success: true });
  } catch (error) {
    res.status(500).json({ error: "Error while fetching the Task Sheets: " + error.message });
  }
};

// ─── EXISTING: getTaskSheet (Manager view) ─────────────────────────────────────
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

    const allTasks = await TaskSheet.find(query)
      .populate({
        path: 'project',
        select: 'name startDate endDate completeLevel custId',
        populate: { path: 'custId', select: 'custName' }
      })
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTester', 'name')
      .populate('parentTaskId', 'taskName subtaskName')
      .sort({ startDate: 1 });

    if (allTasks.length <= 0) {
      return res.status(404).json({ success: false, error: "No Task Found" });
    }

    res.status(200).json({ success: true, task: allTasks });
  } catch (error) {
    res.status(500).json({ error: "Error while getting taskSheet using id: " + error.message });
  }
};

// ─── EXISTING: myTask ──────────────────────────────────────────────────────────
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
      .populate('assignedBy', 'name')
      .populate('assignedTester', 'name')
      .populate('parentTaskId', 'taskName subtaskName taskLevel');

    res.status(200).json({
      task: task || [],
      success: true,
      totalRecord: task ? task.length : 0,
    });

  } catch (error) {
    res.status(500).json({ error: "Error in myTask controller: " + error.message });
  }
};

// ─── NEW: getSubTasksForParent ─────────────────────────────────────────────────
exports.getSubTasksForParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const user = req.user;

    const subTasks = await TaskSheet.find({
      parentTaskId: parentId,
      company: user.company ? user.company : user._id,
    })
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('assignedBy', 'name')
      .sort({ startDate: 1 });

    res.status(200).json({ success: true, subTasks: subTasks || [] });
  } catch (error) {
    res.status(500).json({ error: "Error fetching sub-tasks: " + error.message });
  }
};

// ─── NEW: createSubTask ────────────────────────────────────────────────────────
exports.createSubTask = async (req, res) => {
  try {
    const { parentTaskId, employees, taskName, subtaskName, startDate, endDate, remark, priority } = req.body;
    const user = req.user;

    if (!parentTaskId || !employees || !taskName || !startDate || !endDate || !priority) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided (parentTaskId, employees, taskName, startDate, endDate, priority)"
      });
    }

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ success: false, error: "At least one employee must be assigned" });
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ success: false, error: "Invalid priority value" });
    }

    const parentTask = await TaskSheet.findById(parentTaskId).populate('project');
    if (!parentTask) {
      return res.status(404).json({ success: false, error: "Parent task not found" });
    }

    const isAssigned = parentTask.employees.some(
      empId => empId.toString() === user._id.toString()
    );
    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        error: "You can only create sub-tasks under tasks assigned to you"
      });
    }

    const companyId = parentTask.company;

    const subTask = await TaskSheet.create({
      employees,
      taskName,
      subtaskName: subtaskName || "",
      project: parentTask.project._id || parentTask.project,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      remark,
      priority,
      company: companyId,
      assignedBy: user._id,
      parentTaskId: parentTaskId,
      assignedByRole: 'teamlead'
    });

    if (subTask) {
      const populatedSubTask = await TaskSheet.findById(subTask._id)
        .populate('taskName', 'name')
        .populate('employees', 'name')
        .populate('project', 'name')
        .populate('assignedBy', 'name')
        .populate('parentTaskId', 'taskName subtaskName');

      if (employees && Array.isArray(employees)) {
        const projectName = parentTask.project?.name || 'Project';
        for (const employeeId of employees) {
          try {
            newTaskAssignedMail(employeeId, subTask, projectName);
          } catch (emailError) {
            console.error("Failed to send subtask email:", emailError);
          }
        }
      }

      return res.status(201).json({
        success: true,
        message: "Sub-task assigned to employee(s) successfully",
        data: populatedSubTask
      });
    }
  } catch (error) {
    console.error("Error creating sub-task:", error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }
    res.status(500).json({ error: "Error while creating sub-task: " + error.message });
  }
};

// ─── EXISTING: updateSubtask ──────────────────────────────────────────────────
exports.updateSubtask = async (req, res) => {
  try {
    const { id } = req.params;
    const { subtaskName } = req.body;
    const user = req.user;

    const task = await TaskSheet.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (!task.employees.includes(user._id)) {
      return res.status(403).json({ success: false, error: "You are not authorized to update this task" });
    }

    task.subtaskName = subtaskName;
    await task.save();

    res.status(200).json({ success: true, message: "Subtask updated successfully", data: task });
  } catch (error) {
    res.status(500).json({ error: "Error updating subtask: " + error.message });
  }
};

// ─── EXISTING: notifyCompletion ───────────────────────────────────────────────
exports.notifyCompletion = async (req, res) => {
  try {
    const { taskId, assignedById, employeeId, taskName } = req.body;

    if (!taskId || !assignedById) {
      return res.status(400).json({ success: false, error: "taskId and assignedById are required" });
    }

    const task = await TaskSheet.findById(taskId)
      .populate('taskName', 'name')
      .populate('project', 'name')
      .populate('employees', 'name');

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (task.taskLevel !== 100) {
      return res.status(200).json({ success: false, message: "Task is not yet 100% complete" });
    }

    const assigner = await Employee.findById(assignedById).select('name email');
    if (!assigner || !assigner.email) {
      return res.status(404).json({ success: false, error: "Assigner not found or has no email" });
    }

    const employee = await Employee.findById(employeeId).select('name');

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

// ─── EXISTING: create (Manager assigns task) ───────────────────────────────────
exports.create = async (req, res) => {
  try {
    const { project, employees, taskName, subtaskName, startDate, endDate, remark, priority, assignedTester } = req.body;
    const user = req.user;

    if (!project || !employees || !taskName || !startDate || !endDate || !priority) {
      return res.status(400).json({ success: false, error: "All required fields must be provided" });
    }

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ success: false, error: "At least one employee must be assigned" });
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ success: false, error: "Invalid priority value" });
    }

    const existingProject = await Project.findById(project);
    if (!existingProject) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    const task = await TaskSheet.create({
      employees,
      taskName,
      subtaskName,
      project,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      remark,
      priority,
      company: user.company ? user.company : user._id,
      assignedBy: user._id,
      assignedByRole: 'manager',
      parentTaskId: null,
      // Optional — if the Manager doesn't pick one, the developer picks
      // their own tester later when they submit for testing.
      assignedTester: assignedTester || null,
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
        .populate('assignedBy', 'name')
        .populate('assignedTester', 'name');

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

      if (assignedTester) {
        try {
          newTaskAssignedMail(assignedTester, task, existingProject.name);
        } catch (emailError) {
          console.error("Failed to send tester notification email:", emailError);
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
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: "Duplicate entry found" });
    }
    res.status(500).json({ error: "Error while creating taskSheet: " + error.message });
  }
};

// ─── EXISTING: update ─────────────────────────────────────────────────────────
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
      return res.status(404).json({ success: false, error: "TaskSheet not found" });
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

    const task = await TaskSheet.findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
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
          if (employee) await logAssignment(task, employee, user, req, 'Task');
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
              changes: [{ field: 'employees', oldValue: employee.name, newValue: 'Removed' }],
              description: `Task unassigned from ${employee.name}`,
              metadata: { ipAddress: req.ip || req.connection.remoteAddress, userAgent: req.headers['user-agent'] }
            });
          }
        } catch (error) {
          console.error('Error logging employee removal:', error);
        }
      }
    }

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
        }
      } catch (mailErr) {
        console.error("Failed to send completion email:", mailErr);
      }
    }

    res.status(200).json({ success: true, message: "TaskSheet updated successfully", data: task });
  } catch (error) {
    console.error("Error updating task sheet:", error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }
    res.status(500).json({ error: "Error while updating Task Sheet: " + error.message });
  }
};

// ─── NEW: assignTester ─────────────────────────────────────────────────────────
// Manager can (re)assign a tester on an existing task without recreating it.
exports.assignTester = async (req, res) => {
  try {
    const { id } = req.params;
    const { testerId } = req.body;

    if (!testerId) {
      return res.status(400).json({ success: false, error: "testerId is required" });
    }

    const task = await TaskSheet.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    task.assignedTester = testerId;
    await task.save();

    const populated = await TaskSheet.findById(id)
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('assignedTester', 'name email')
      .populate('assignedBy', 'name')
      .populate('project', 'name');

    try {
      newTaskAssignedMail(testerId, populated, populated.project?.name || 'Project');
    } catch (e) {
      console.error("Tester notification failed:", e);
    }

    res.status(200).json({ success: true, message: "Tester assigned successfully", data: populated });
  } catch (error) {
    res.status(500).json({ error: "Error assigning tester: " + error.message });
  }
};

// ─── UPDATED: submitForTesting ──────────────────────────────────────────────────
// Developer calls this once their work reaches 100%.
//
// ── NEW BEHAVIOR ──
// - If the Manager already assigned a tester on this task, `testerId` in the
//   body is ignored — the existing tester is used.
// - If NO tester was assigned by the Manager, the developer MUST choose one
//   in `testerId` — this is their own decision about who reviews their work.
// - testStartDate is stamped automatically the moment this runs — no manual
//   date entry needed anywhere in this workflow.
// - testProgress resets to 0 for the new testing round.
exports.submitForTesting = async (req, res) => {
  try {
    const { id } = req.params;
    const { testerId } = req.body; // only used if task has no assignedTester yet
    const user = req.user;

    const task = await TaskSheet.findById(id).populate('assignedTester', 'name email');
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (!task.employees.some(empId => empId.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: "You are not assigned to this task" });
    }

    // ── Determine the tester: Manager's choice wins if already set;
    // otherwise the developer's choice (testerId from the request) is used. ──
    if (!task.assignedTester) {
      if (!testerId) {
        return res.status(400).json({
          success: false,
          error: "No tester is assigned to this task. Please choose a tester before submitting for testing."
        });
      }
      const testerExists = await Employee.findById(testerId).select('_id name');
      if (!testerExists) {
        return res.status(404).json({ success: false, error: "Selected tester not found" });
      }
      task.assignedTester = testerId;
    }

    task.taskLevel = 100;
    task.taskStatus = 'inprocess'; // not fully "completed" yet — pending QA review
    task.qaStatus = 'pending_test';
    task.testStartDate = new Date();   // ✅ automatic — no manual date entry
    task.testEndDate = null;
    task.testProgress = 0;             // reset for this testing round
    await task.save();

    const populated = await TaskSheet.findById(id).populate('assignedTester', 'name email');

    res.status(200).json({
      success: true,
      message: `Work submitted for testing. ${populated.assignedTester?.name || 'The tester'} has been notified.`,
      data: populated
    });
  } catch (error) {
    res.status(500).json({ error: "Error submitting for testing: " + error.message });
  }
};

// ─── NEW: updateTestProgress ─────────────────────────────────────────────────────
// Tester updates their own in-progress completion percentage while reviewing
// (e.g. "I've tested 90% so far") — independent from the developer's taskLevel.
// This does not finalize the task; only Pass/Fail (submitTestResult) does that.
exports.updateTestProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { progress } = req.body;
    const user = req.user;

    const progressNum = Number(progress);
    if (isNaN(progressNum) || progressNum < 0 || progressNum > 100) {
      return res.status(400).json({ success: false, error: "Progress must be a number between 0 and 100" });
    }

    const task = await TaskSheet.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (!task.assignedTester || task.assignedTester.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: "You are not the assigned tester for this task" });
    }

    task.testProgress = progressNum;
    // Move from 'pending_test' to 'testing' once the tester actually starts logging progress
    if (task.qaStatus === 'pending_test') {
      task.qaStatus = 'testing';
    }
    await task.save();

    res.status(200).json({ success: true, message: "Testing progress updated", data: task });
  } catch (error) {
    res.status(500).json({ error: "Error updating test progress: " + error.message });
  }
};

// ─── NEW: getTesterTasks ─────────────────────────────────────────────────────────
exports.getTesterTasks = async (req, res) => {
  try {
    const user = req.user;
    const tasks = await TaskSheet.find({
      assignedTester: user._id,
      qaStatus: { $in: ['pending_test', 'testing', 'bug_found', 'passed'] }
    })
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('project', 'name')
      .populate('assignedBy', 'name')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, task: tasks || [] });
  } catch (error) {
    res.status(500).json({ error: "Error fetching tester tasks: " + error.message });
  }
};

// ─── UPDATED: submitTestResult ────────────────────────────────────────────────────
// Tester marks Pass (fully complete) or Fail (bounces back to developer with
// a bug remark). testEndDate is now stamped automatically on either outcome.
exports.submitTestResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { result, remark } = req.body; // result: 'pass' | 'fail'
    const user = req.user;

    if (!['pass', 'fail'].includes(result)) {
      return res.status(400).json({ success: false, error: "result must be 'pass' or 'fail'" });
    }

    const task = await TaskSheet.findById(id)
      .populate('taskName', 'name')
      .populate('employees', 'name email')
      .populate('project', 'name');

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (!task.assignedTester || task.assignedTester.toString() !== user._id.toString()) {
      return res.status(403).json({ success: false, error: "You are not the assigned tester for this task" });
    }

    const now = new Date(); // ✅ automatic test-end timestamp for both outcomes

    if (result === 'pass') {
      task.qaStatus = 'passed';
      task.taskStatus = 'completed';
      task.taskLevel = 100;
      task.testProgress = 100;
      task.testEndDate = now;
    } else {
      if (!remark || !remark.trim()) {
        return res.status(400).json({ success: false, error: "Please describe the bug before returning the task" });
      }
      task.qaStatus = 'bug_found';
      task.taskStatus = 'stuck';
      task.taskLevel = Math.min(task.taskLevel, 90);
      task.testCycles = (task.testCycles || 0) + 1;
      task.testEndDate = now;
      task.bugHistory.push({ remark: remark.trim(), reportedBy: user._id, reportedAt: now });
    }

    await task.save();

    if (result === 'fail' && task.employees && Array.isArray(task.employees)) {
      for (const emp of task.employees) {
        try {
          const empId = emp._id || emp;
          newTaskAssignedMail(empId, task, task.project?.name || 'Project');
        } catch (e) {
          console.error("Bug notification failed:", e);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: result === 'pass' ? "Task passed and marked completed" : "Bug reported — task returned to developer",
      data: task
    });
  } catch (error) {
    res.status(500).json({ error: "Error submitting test result: " + error.message });
  }
};

// ─── EXISTING: delete ─────────────────────────────────────────────────────────
exports.delete = async (req, res) => {
  try {
    const taskSheetId = req.params.id;
    const user = req.user;
    const task = await TaskSheet.findById(taskSheetId);

    if (!task) {
      return res.status(404).json({ success: false, error: "TaskSheet not found" });
    }

    await logDeletion(task, user, req, 'Task');
    await TaskSheet.findByIdAndDelete(taskSheetId);
    await Action.deleteMany({ task: taskSheetId });

    const childIds = await TaskSheet.find({ parentTaskId: taskSheetId }).distinct('_id');
    if (childIds.length > 0) {
      await TaskSheet.deleteMany({ parentTaskId: taskSheetId });
      await Action.deleteMany({ task: { $in: childIds } });
    }

    res.status(200).json({ success: true, message: "TaskSheet and associated actions deleted successfully" });
  } catch (error) {
    console.error("Error deleting task sheet:", error);
    res.status(500).json({ error: "Error while deleting TaskSheet: " + error.message });
  }
};