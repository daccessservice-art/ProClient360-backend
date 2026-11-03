const Action = require('../models/actionModel');
const TaskSheet = require('../models/taskSheetModel');
const Employee = require('../models/employeeModel');
const Notification = require('../models/notificationModel');
const { admin } = require('../utils/firebase');
const { applyMyProgress, syncSharedTaskProgress } = require('../helpers/myTaskProgress');

// Helper function to send notifications to a single user
const sendNotificationToUser = async (userId, message, senderId, currentUserName, currentUserProfilePic) => {
    try {
        if (userId.toString() === senderId.toString()) return;

        const employee = await Employee.findById(userId);
        if (!employee) return;

        const newNotification = new Notification({ message, userIds: userId, sender: senderId });
        await newNotification.save();

        if (employee.fcmToken) {
            const messagePayload = {
                notification: { title: `Task Status Update`, body: message },
                token: employee.fcmToken,
                data: {
                    sender: currentUserName,
                    profilePic: currentUserProfilePic,
                    message,
                    time: new Date().toISOString(),
                    isSeen: "false",
                },
            };
            try {
                await admin.messaging().send(messagePayload);
            } catch (error) {
                console.error('Error sending FCM notification:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendNotificationToUser:', error);
    }
};

// Notify ONLY the task assigner when someone marks stuck / completed
const handleStatusChangeNotifications = async (taskStatus, currentStatus, tasksheet, currentUserId) => {
    if ((taskStatus !== 'stuck' && taskStatus !== 'completed') || currentStatus === taskStatus) return;

    try {
        const currentUser = await Employee.findById(currentUserId);
        const statusText = taskStatus === 'completed' ? 'completed' : 'stuck';
        const message = `Task "${tasksheet.taskName.name}" has been marked as ${statusText} by ${currentUser.name}.`;

        if (tasksheet.assignedBy) {
            const assignerId = tasksheet.assignedBy._id ? tasksheet.assignedBy._id.toString() : tasksheet.assignedBy.toString();
            if (assignerId !== currentUserId.toString()) {
                await sendNotificationToUser(assignerId, message, currentUserId, currentUser.name, currentUser.profilePic);
            }
        }
    } catch (error) {
        console.error('Error in handleStatusChangeNotifications:', error);
    }
};

const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

// ─── GET actions of a task (history of ALL employees, oldest -> latest) ──────
// ✅ NEW: also returns myLastActionId — only THIS user's latest action can be edited
exports.showAll = async (req, res) => {
    try {
        const { taskId } = req.params;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { task: taskId };

        const actions = await Action.find(query)
            .sort({ _id: 1 })
            .skip(skip)
            .limit(limit)
            .populate('actionBy', 'name')
            .populate('task', 'taskStatus')
            .lean();

        if (actions.length <= 0) {
            return res.status(404).json({ success: false, message: "No Actions Available" });
        }

        const totalRecords = await Action.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        const myLast = await Action.findOne({ task: taskId, actionBy: req.user._id }).sort({ _id: -1 }).select('_id').lean();

        res.status(200).json({
            success: true,
            actions,
            myLastActionId: myLast ? myLast._id.toString() : null,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Error while fetching the Tasksheet Actions : " + error.message });
    }
};

// ─── UPDATE (edit my latest action) ──────────────────────────────────────────
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, startTime, endTime, taskStatus, complated, remark } = req.body;
        const userId = req.user._id;

        const currentAction = await Action.findById(id);
        if (!currentAction) {
            return res.status(404).json({ success: false, error: "action not found..." });
        }

        // ✅ only the owner of the action can edit it
        if (idOf(currentAction.actionBy) !== userId.toString()) {
            return res.status(403).json({ success: false, error: "You can only edit your own action" });
        }

        // ✅ only MY latest action on this task can be edited
        const myLast = await Action.findOne({ task: currentAction.task, actionBy: userId }).sort({ _id: -1 }).select('_id');
        if (!myLast || myLast._id.toString() !== id.toString()) {
            return res.status(400).json({ success: false, error: "Only your latest action can be edited" });
        }

        const newLevel = taskStatus === 'completed' ? 100 : Number(complated);
        if (isNaN(newLevel) || newLevel < 0 || newLevel > 100) {
            return res.status(400).json({ success: false, error: "Completed level must be between 0 and 100" });
        }

        const currentStatus = currentAction.taskStatus;

        const updatedData = { action, startTime, endTime, complated: newLevel, taskStatus };
        if (remark !== undefined) updatedData.remark = remark;

        await Action.findByIdAndUpdate(id, updatedData, { new: true, runValidators: true });

        const tasksheet = await TaskSheet.findById(currentAction.task)
            .populate('taskName')
            .populate('employees')
            .populate({ path: 'assignedBy', strictPopulate: false })
            .populate({ path: 'createdBy', strictPopulate: false });

        if (tasksheet) {
            if ((tasksheet.employees || []).length > 1) {
                // many employees: shared task is recalculated from everyone's own work
                await syncSharedTaskProgress(tasksheet._id);
            } else {
                tasksheet.taskStatus = taskStatus;
                tasksheet.taskLevel = newLevel;
                await tasksheet.save({ validateBeforeSave: false });
            }
            await handleStatusChangeNotifications(taskStatus, currentStatus, tasksheet, userId);
        }

        res.status(200).json({ success: true, message: "Action Updated..." });
    } catch (error) {
        console.error("Error in update action:", error);
        res.status(500).json({ error: "Error while Updating the Tasksheet Action : " + error.message });
    }
};

// ─── CREATE (Submit Work) — per-employee progress ────────────────────────────
exports.create = async (req, res) => {
    try {
        const { task, action, startTime, endTime, taskStatus, taskLevel, remark } = req.body;
        const userId = req.user._id;

        const tasksheet = await TaskSheet.findById(task)
            .populate('taskName')
            .populate('employees')
            .populate({ path: 'assignedBy', strictPopulate: false })
            .populate({ path: 'createdBy', strictPopulate: false });

        if (!tasksheet) {
            return res.status(404).json({ success: false, error: "Task not found" });
        }

        // ✅ only an assigned employee can log work
        const isAssigned = (tasksheet.employees || []).some(e => idOf(e) === userId.toString());
        if (!isAssigned) {
            return res.status(403).json({ success: false, error: "You are not assigned to this task" });
        }

        // ✅ task is with the tester -> no new work
        if (tasksheet.qaStatus === 'pending_test' || tasksheet.qaStatus === 'testing') {
            return res.status(400).json({ success: false, error: "This task is with the tester. You can't log new work until it's reviewed." });
        }

        // ✅ MY OWN current level (not the shared one)
        const [mine] = await applyMyProgress([tasksheet], userId);
        const myPrevLevel = mine.taskLevel || 0;
        const currentStatus = mine.taskStatus;

        const newLevel = taskStatus === 'completed' ? 100 : Number(taskLevel);
        if (isNaN(newLevel) || newLevel < 0 || newLevel > 100) {
            return res.status(400).json({ success: false, error: "Task level must be between 0 and 100" });
        }
        if (myPrevLevel >= 100) {
            return res.status(400).json({ success: false, error: "You have already completed this task" });
        }
        if (newLevel < myPrevLevel) {
            return res.status(400).json({ success: false, error: `Task level must be greater than your previous level (${myPrevLevel}%)` });
        }

        // 1) save the action FIRST (shared progress is calculated from actions)
        const newAction = new Action({
            task,
            action,
            actionBy: userId,
            startTime,
            endTime,
            complated: newLevel,
            taskStatus,
            remark,
        });
        await newAction.save();

        // 2) update the shared task
        if ((tasksheet.employees || []).length > 1) {
            // many employees: completed ONLY when everyone reached 100%
            await syncSharedTaskProgress(tasksheet._id);
        } else {
            if (taskStatus === 'completed') {
                tasksheet.taskStatus = taskStatus;
                tasksheet.taskLevel = 100;
                if (!tasksheet.actualEndDate) tasksheet.actualEndDate = endTime;
            } else {
                tasksheet.taskLevel = newLevel;
                tasksheet.taskStatus = taskStatus;
            }
            await tasksheet.save({ validateBeforeSave: false });
        }

        // 3) notify assigner (this employee's own completion / stuck)
        await handleStatusChangeNotifications(taskStatus, currentStatus, tasksheet, userId);

        res.status(200).json({ success: true, message: "Action Created" });
    } catch (error) {
        console.error("Error in create action:", error);
        res.status(500).json({ error: "Error while Creating the Tasksheet Action : " + error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const action = await Action.findByIdAndDelete(id);

        if (!action) {
            return res.status(404).json({ success: false, error: "Action not found..." });
        }

        // keep shared task in sync for multi-employee tasks
        try {
            const ts = await TaskSheet.findById(action.task).select('employees');
            if (ts && (ts.employees || []).length > 1) await syncSharedTaskProgress(ts._id);
        } catch (e) {
            console.error("Sync after delete failed:", e);
        }

        res.status(200).json({ success: true, message: "Action Deleted Successfully..." });
    } catch (error) {
        res.status(500).json({ error: "Error while deleting the Tasksheet Action : " + error.message });
    }
};