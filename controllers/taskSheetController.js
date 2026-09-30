const TaskSheet = require("../models/taskSheetModel");
const jwt = require("jsonwebtoken");
const Action = require("../models/actionModel");
const Project = require('../models/projectModel');
const Designation = require('../models/designationModel');
const Employee = require('../models/employeeModel');
const { newTaskAssignedMail } = require("../mailsService/newTaskAssign");
const { taskCompletedMail } = require("../mailsService/taskCompletedMail");
const { logCreation, logUpdate, logDeletion } = require('../helpers/activityLogHelper');

// ─── NEW helper: per-employee progress on a shared task ──────────────────────
// A task can have many employees, but taskLevel is ONE shared number.
// This reads each employee's OWN highest logged % from the Action history
// (actionBy + complated), so one employee finishing does NOT mark every
// other employee on the same task as completed.
// Returns: { [taskId]: { [employeeId]: level } }
const buildEmployeeProgressMap = async (taskIds) => {
  if (!taskIds || taskIds.length === 0) return {};

  const rows = await Action.aggregate([
    { $match: { task: { $in: taskIds } } },
    {
      $group: {
        _id: { task: '$task', actionBy: '$actionBy' },
        level: {
          $max: {
            $convert: { input: '$complated', to: 'double', onError: 0, onNull: 0 }
          }
        }
      }
    }
  ]);

  const map = {};
  rows.forEach(r => {
    if (!r._id?.task || !r._id?.actionBy) return;
    const taskKey = r._id.task.toString();
    const empKey = r._id.actionBy.toString();
    if (!map[taskKey]) map[taskKey] = {};
    map[taskKey][empKey] = Math.min(100, r.level || 0);
  });
  return map;
};

// ─── NEW helpers: multiple testers ───────────────────────────────────────────
// A task can now have MANY testers (assignedTesters). The old single
// assignedTester field is kept (= first tester) so old data + old screens
// keep working. ANY ONE of the testers can Pass / Report Bug.
const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

const toIdArray = (val) => {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return [...new Set(arr.map(idOf).filter(Boolean))];
};

const getTaskTesterIds = (task) => {
  const ids = toIdArray(task.assignedTesters);
  const primary = idOf(task.assignedTester);
  if (primary && !ids.includes(primary)) ids.unshift(primary);
  return ids;
};

const isTaskTester = (task, userId) => getTaskTesterIds(task).includes(idOf(userId));

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

// ─── UPDATED: getTaskSheet (Manager view) — now includes employeeProgress ─────
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
      .populate('assignedTesters', 'name') // ✅ NEW
      .populate('parentTaskId', 'taskName subtaskName')
      .sort({ startDate: 1 });

    if (allTasks.length <= 0) {
      return res.status(404).json({ success: false, error: "No Task Found" });
    }

    // ── NEW: attach each employee's own progress to every task ──
    const progressMap = await buildEmployeeProgressMap(allTasks.map(t => t._id));
    const tasksWithProgress = allTasks.map(t => {
      const obj = t.toObject();
      obj.employeeProgress = progressMap[t._id.toString()] || {};
      return obj;
    });

    res.status(200).json({ success: true, task: tasksWithProgress });
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
      .populate('assignedTesters', 'name') // ✅ NEW
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

// ─── UPDATED: getSubTasksForParent — now includes employeeProgress ─────────────
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

    // ── NEW: per-employee progress for sub-tasks too ──
    const progressMap = await buildEmployeeProgressMap((subTasks || []).map(t => t._id));
    const subTasksWithProgress = (subTasks || []).map(t => {
      const obj = t.toObject();
      obj.employeeProgress = progressMap[t._id.toString()] || {};
      return obj;
    });

    res.status(200).json({ success: true, subTasks: subTasksWithProgress });
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
    const { project, employees, taskName, subtaskName, startDate, endDate, remark, priority, assignedTester, assignedTesters } = req.body;
    // ✅ NEW — accepts many testers (assignedTesters) or the old single one
    const testerIds = toIdArray(Array.isArray(assignedTesters) && assignedTesters.length ? assignedTesters : assignedTester);
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
      // Optional — if the Manager doesn't pick any, the developer picks
      // their own tester later when they submit for testing.
      assignedTesters: testerIds,             // ✅ NEW — all testers
      assignedTester: testerIds[0] || null,   // first tester (backward compatible)
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
        .populate('assignedTester', 'name')
        .populate('assignedTesters', 'name');

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

      // ✅ UPDATED — notify every tester
      for (const testerId of testerIds) {
        try {
          newTaskAssignedMail(testerId, task, existingProject.name);
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
    // ✅ UPDATED — accepts testerIds (array) or the old single testerId
    const testerIds = toIdArray(req.body.testerIds || req.body.testerId);

    if (testerIds.length === 0) {
      return res.status(400).json({ success: false, error: "At least one tester is required" });
    }

    const task = await TaskSheet.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    task.assignedTesters = testerIds;
    task.assignedTester = testerIds[0];
    await task.save();

    const populated = await TaskSheet.findById(id)
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('assignedTester', 'name email')
      .populate('assignedTesters', 'name email')
      .populate('assignedBy', 'name')
      .populate('project', 'name');

    for (const testerId of testerIds) {
      try {
        newTaskAssignedMail(testerId, populated, populated.project?.name || 'Project');
      } catch (e) {
        console.error("Tester notification failed:", e);
      }
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
    // only used if the task has no tester yet — accepts testerIds or testerId
    const pickedTesterIds = toIdArray(req.body.testerIds || req.body.testerId);
    const user = req.user;

    const task = await TaskSheet.findById(id);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    if (!task.employees.some(empId => empId.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: "You are not assigned to this task" });
    }

    // ── Determine the tester: Manager's choice wins if already set;
    // otherwise the developer's choice (testerId from the request) is used. ──
    if (getTaskTesterIds(task).length === 0) {
      if (pickedTesterIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No tester is assigned to this task. Please choose a tester before submitting for testing."
        });
      }
      const found = await Employee.find({ _id: { $in: pickedTesterIds } }).select('_id');
      if (found.length !== pickedTesterIds.length) {
        return res.status(404).json({ success: false, error: "Selected tester not found" });
      }
      task.assignedTesters = pickedTesterIds;
      task.assignedTester = pickedTesterIds[0];
    }

    task.taskLevel = 100;
    task.taskStatus = 'inprocess'; // not fully "completed" yet — pending QA review
    task.qaStatus = 'pending_test';
    task.testStartDate = new Date();   // ✅ automatic — no manual date entry
    task.testEndDate = null;
    task.testProgress = 0;             // reset for this testing round
    task.testedBy = null;              // ✅ NEW — cleared for the new round
    await task.save();

    const populated = await TaskSheet.findById(id)
      .populate('assignedTester', 'name email')
      .populate('assignedTesters', 'name email');

    const testerNames = (populated.assignedTesters?.length ? populated.assignedTesters : [populated.assignedTester])
      .filter(Boolean).map(t => t.name).join(', ');

    res.status(200).json({
      success: true,
      message: `Work submitted for testing. ${testerNames || 'The tester'} can now review it.`,
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

    // ✅ UPDATED — any one of the task's testers is allowed
    if (!isTaskTester(task, user._id)) {
      return res.status(403).json({ success: false, error: "You are not an assigned tester for this task" });
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
    // ✅ UPDATED — tasks where I am the first tester OR one of many testers
    const tasks = await TaskSheet.find({
      $or: [{ assignedTester: user._id }, { assignedTesters: user._id }],
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

    // ✅ UPDATED — any one of the task's testers is allowed
    if (!isTaskTester(task, user._id)) {
      return res.status(403).json({ success: false, error: "You are not an assigned tester for this task" });
    }

    const now = new Date(); // ✅ automatic test-end timestamp for both outcomes
    task.testedBy = user._id; // ✅ NEW — which tester gave the verdict (any one can)

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

// ─── NEW: exportMyTeamReport (Excel) ──────────────────────────────────────────
// Senior employee (logged in) downloads, for ONE project:
//   Sheet 1 "Team Summary"    → one row per junior (totals)
//   Sheet 2 "Team Sub-Tasks"  → every sub-task I gave my juniors, one row
//                               per junior with THEIR OWN progress
//   Sheet 3 "My Tasks"        → tasks assigned to me in this project
// Only data belonging to the logged-in user is included.
exports.exportMyTeamReport = async (req, res) => {
  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch (e) {
    return res.status(500).json({ success: false, error: "Excel library missing on server. Run: npm install exceljs" });
  }

  try {
    const user = req.user;
    const { projectId } = req.params;
    const userId = user._id.toString();
    const now = new Date();

    const project = await Project.findById(projectId).select('name');
    if (!project) {
      return res.status(404).json({ success: false, error: "Project not found" });
    }

    // Sub-tasks I (as senior) gave to juniors in this project
    const teamSubTasks = await TaskSheet.find({
      project: projectId,
      assignedBy: user._id,
      assignedByRole: 'teamlead',
    })
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate({ path: 'parentTaskId', select: 'taskName subtaskName', populate: { path: 'taskName', select: 'name' } })
      .sort({ startDate: 1 })
      .lean();

    // Tasks assigned to me in this project
    const myTasks = await TaskSheet.find({ project: projectId, employees: user._id })
      .populate('taskName', 'name')
      .populate('assignedBy', 'name')
      .populate('assignedTester', 'name')
      .populate('assignedTesters', 'name')
      .populate('employees', 'name')
      .sort({ startDate: 1 })
      .lean();

    // Per-employee stats from Action history (level, hours, last update)
    const allIds = [...teamSubTasks, ...myTasks].map(t => t._id);
    const actions = allIds.length
      ? await Action.find({ task: { $in: allIds } }).select('task actionBy startTime endTime complated').lean()
      : [];

    const stats = {}; // stats[taskId][empId] = { level, hours, lastUpdate }
    actions.forEach(a => {
      const t = idOf(a.task), e = idOf(a.actionBy);
      if (!t || !e) return;
      if (!stats[t]) stats[t] = {};
      if (!stats[t][e]) stats[t][e] = { level: 0, hours: 0, lastUpdate: null };
      const s = stats[t][e];
      const lvl = Number(a.complated) || 0;
      if (lvl > s.level) s.level = Math.min(100, lvl);
      const st = new Date(a.startTime), en = new Date(a.endTime);
      if (!isNaN(st) && !isNaN(en) && en > st) s.hours += (en - st) / 36e5;
      if (!isNaN(en) && (!s.lastUpdate || en > s.lastUpdate)) s.lastUpdate = en;
    });

    const empLevel = (task, empId) => {
      if (task.qaStatus === 'passed') return 100;
      const own = stats[idOf(task)]?.[empId]?.level || 0;
      const count = Array.isArray(task.employees) ? task.employees.length : 0;
      if (count <= 1) return Math.max(own, task.taskLevel || 0);
      return own;
    };

    const statusOf = (level, endDate) => {
      if (level >= 100) return 'Completed';
      if (endDate && new Date(endDate) < now) return 'Overdue';
      if (level > 0) return 'In Progress';
      return 'Not Started';
    };

    const daysOverdue = (level, endDate) => {
      if (level >= 100 || !endDate) return 0;
      const d = new Date(endDate);
      return d < now ? Math.floor((now - d) / 864e5) : 0;
    };

    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
    const qaText = (q) => ({ none: 'Not Submitted', pending_test: 'With Tester', testing: 'Testing', bug_found: 'Bug Found', passed: 'Passed' }[q] || '-');

    // ── Build rows ──
    const teamRows = [];
    const summary = {};
    teamSubTasks.forEach(st => {
      (st.employees || []).forEach(emp => {
        const eid = idOf(emp);
        const level = empLevel(st, eid);
        const status = statusOf(level, st.endDate);
        const s = stats[idOf(st)]?.[eid] || {};
        teamRows.push({
          employee: emp.name || 'Employee',
          task: st.taskName?.name || 'Task',
          subtask: st.subtaskName || '',
          parent: st.parentTaskId?.taskName?.name
            ? st.parentTaskId.taskName.name + (st.parentTaskId.subtaskName ? ` › ${st.parentTaskId.subtaskName}` : '')
            : '',
          priority: cap(st.priority),
          start: st.startDate ? new Date(st.startDate) : null,
          end: st.endDate ? new Date(st.endDate) : null,
          progress: level / 100,
          status,
          overdue: daysOverdue(level, st.endDate),
          hours: Math.round((s.hours || 0) * 10) / 10,
          lastUpdate: s.lastUpdate || null,
          remark: st.remark || '',
        });

        const key = emp.name || eid;
        if (!summary[key]) summary[key] = { employee: key, total: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, sumLevel: 0, hours: 0 };
        const sm = summary[key];
        sm.total++;
        sm.sumLevel += level;
        sm.hours += s.hours || 0;
        if (status === 'Completed') sm.completed++;
        else if (status === 'Overdue') sm.overdue++;
        else if (status === 'In Progress') sm.inProgress++;
        else sm.notStarted++;
      });
    });

    const myRows = myTasks.map(t => {
      const level = empLevel(t, userId);
      const testers = (t.assignedTesters?.length ? t.assignedTesters : [t.assignedTester]).filter(Boolean).map(x => x.name).join(', ');
      const s = stats[idOf(t)]?.[userId] || {};
      return {
        task: t.taskName?.name || 'Task',
        subtask: t.subtaskName || '',
        type: t.assignedByRole === 'teamlead' ? 'Sub-task' : 'Manager task',
        assignedBy: t.assignedBy?.name || '',
        team: (t.employees || []).map(e => e.name).join(', '),
        priority: cap(t.priority),
        start: t.startDate ? new Date(t.startDate) : null,
        end: t.endDate ? new Date(t.endDate) : null,
        progress: level / 100,
        status: statusOf(level, t.endDate),
        qa: testers ? qaText(t.qaStatus) : 'No Tester',
        testers: testers || '-',
        hours: Math.round((s.hours || 0) * 10) / 10,
      };
    });

    // ── Workbook ──
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ProClient360';
    wb.created = now;

    const STATUS_FILL = { Completed: 'FFDCFCE7', 'In Progress': 'FFDBEAFE', Overdue: 'FFFEE2E2', 'Not Started': 'FFF3F4F6' };

    const addSheet = (name, columns, rows, statusKey) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns;
      rows.forEach(r => ws.addRow(r));

      const header = ws.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
      header.alignment = { vertical: 'middle' };
      header.height = 22;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

      if (statusKey) {
        const col = ws.getColumn(statusKey);
        col.eachCell((cell, rowNum) => {
          if (rowNum === 1) return;
          const fill = STATUS_FILL[cell.value];
          if (fill) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            cell.font = { bold: true };
          }
        });
      }
      if (rows.length === 0) ws.addRow({ [columns[0].key]: 'No records' });
      return ws;
    };

    const dateFmt = 'dd-mmm-yyyy';

    addSheet('Team Summary', [
      { header: 'Employee', key: 'employee', width: 24 },
      { header: 'Total Sub-Tasks', key: 'total', width: 16 },
      { header: 'Completed', key: 'completed', width: 12 },
      { header: 'In Progress', key: 'inProgress', width: 12 },
      { header: 'Not Started', key: 'notStarted', width: 12 },
      { header: 'Overdue', key: 'overdue', width: 10 },
      { header: 'Avg Progress', key: 'avg', width: 13, style: { numFmt: '0%' } },
      { header: 'Hours Logged', key: 'hours', width: 13 },
    ], Object.values(summary).map(s => ({
      ...s,
      avg: s.total ? (s.sumLevel / s.total) / 100 : 0,
      hours: Math.round(s.hours * 10) / 10,
    })));

    addSheet('Team Sub-Tasks', [
      { header: 'Employee', key: 'employee', width: 22 },
      { header: 'Task', key: 'task', width: 24 },
      { header: 'Sub-Task', key: 'subtask', width: 28 },
      { header: 'Under (Parent Task)', key: 'parent', width: 28 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Start Date', key: 'start', width: 13, style: { numFmt: dateFmt } },
      { header: 'End Date', key: 'end', width: 13, style: { numFmt: dateFmt } },
      { header: 'Progress', key: 'progress', width: 10, style: { numFmt: '0%' } },
      { header: 'Status', key: 'status', width: 13 },
      { header: 'Days Overdue', key: 'overdue', width: 13 },
      { header: 'Hours Logged', key: 'hours', width: 13 },
      { header: 'Last Update', key: 'lastUpdate', width: 13, style: { numFmt: dateFmt } },
      { header: 'Remark', key: 'remark', width: 40 },
    ], teamRows, 'status');

    addSheet('My Tasks', [
      { header: 'Task', key: 'task', width: 24 },
      { header: 'Sub-Task', key: 'subtask', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Assigned By', key: 'assignedBy', width: 20 },
      { header: 'Team', key: 'team', width: 30 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Start Date', key: 'start', width: 13, style: { numFmt: dateFmt } },
      { header: 'End Date', key: 'end', width: 13, style: { numFmt: dateFmt } },
      { header: 'My Progress', key: 'progress', width: 12, style: { numFmt: '0%' } },
      { header: 'Status', key: 'status', width: 13 },
      { header: 'QA Status', key: 'qa', width: 14 },
      { header: 'Tester(s)', key: 'testers', width: 26 },
      { header: 'Hours Logged', key: 'hours', width: 13 },
    ], myRows, 'status');

    const safeName = (project.name || 'Project').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = `Team_Report_${safeName}_${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting team report:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: "Error exporting team report: " + error.message });
    }
  }
};

// ─── NEW: getMyDueStatus ───────────────────────────────────────────────────────
// For the logged-in employee's "My Projects" page blinkers.
// Returns, per project, how many of MY open tasks are overdue / due today.
// Uses India date (Asia/Kolkata) so "today" matches what the user sees.
// A task is "open" for me if MY OWN progress < 100 and tester hasn't passed it.
// → { success, projects: { [projectId]: { overdue, dueToday, overdueTasks[], dueTodayTasks[] } } }
exports.getMyDueStatus = async (req, res) => {
  try {
    const user = req.user;
    const userId = user._id.toString();

    const query = { employees: user._id };
    if (user.company) query.company = user.company;

    const tasks = await TaskSheet.find(query)
      .select('project taskName subtaskName endDate taskLevel qaStatus employees')
      .populate('taskName', 'name')
      .lean();

    const progressMap = await buildEmployeeProgressMap(tasks.map(t => t._id));

    const toISTDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
    const today = toISTDay(new Date());

    const projects = {};
    tasks.forEach(t => {
      if (!t.project || !t.endDate) return;
      if (t.qaStatus === 'passed') return;

      const own = Number(progressMap[t._id.toString()]?.[userId] || 0);
      const count = Array.isArray(t.employees) ? t.employees.length : 0;
      const level = count <= 1 ? Math.max(own, t.taskLevel || 0) : own;
      if (level >= 100) return;

      const due = toISTDay(t.endDate);
      const pid = t.project.toString();
      if (!projects[pid]) projects[pid] = { overdue: 0, dueToday: 0, overdueTasks: [], dueTodayTasks: [] };

      const label = (t.taskName?.name || 'Task') + (t.subtaskName ? ` › ${t.subtaskName}` : '');
      if (due < today) {
        projects[pid].overdue++;
        projects[pid].overdueTasks.push(label);
      } else if (due === today) {
        projects[pid].dueToday++;
        projects[pid].dueTodayTasks.push(label);
      }
    });

    res.status(200).json({ success: true, projects });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error fetching due status: " + error.message });
  }
};