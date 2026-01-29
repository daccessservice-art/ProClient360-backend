const jwt = require('jsonwebtoken');
const Action = require('../models/actionModel');
const TaskSheet = require('../models/taskSheetModel');
const Employee = require('../models/employeeModel');
const Project = require('../models/projectModel');
const Notification = require('../models/notificationModel');
const {admin} = require('../utils/firebase');

// Helper function to send notifications to a single user
const sendNotificationToUser = async (userId, message, senderId, currentUserName, currentUserProfilePic) => {
    try {
        // Skip if this is the user who made the update
        if (userId.toString() === senderId.toString()) {
            console.log(`Skipping notification for user who made the update: ${userId}`);
            return;
        }
        
        const employee = await Employee.findById(userId);
        if (!employee) {
            console.log(`Employee not found: ${userId}`);
            return;
        }
        
        console.log(`Creating notification for: ${employee.name} (${employee._id})`);
        
        // Create notification in database
        const newNotification = new Notification({
            message,
            userIds: userId,
            sender: senderId
        });
        
        await newNotification.save();
        console.log(`Notification saved with ID: ${newNotification._id}`);
        
        // Send FCM notification if employee has a token
        if (employee.fcmToken) {
            const messagePayload = {
                notification: {
                    title: `Task Status Update`,
                    body: message,
                },
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
                console.log("FCM notification sent to:", employee.name);
            } catch (error) {
                console.error('Error sending FCM notification:', error);
            }
        }
    } catch (error) {
        console.error('Error in sendNotificationToUser:', error);
    }
};

// Helper function to handle status change notifications - ONLY NOTIFY TASK ASSIGNER
const handleStatusChangeNotifications = async (taskStatus, currentStatus, tasksheet, currentUserId) => {
    // Only send notifications if status changed to "stuck" or "completed"
    if ((taskStatus !== 'stuck' && taskStatus !== 'completed') || currentStatus === taskStatus) {
        return;
    }
    
    try {
        // Get the current user who made the update
        const currentUser = await Employee.findById(currentUserId);
        
        // Create notification message
        const statusText = taskStatus === 'completed' ? 'completed' : 'stuck';
        const message = `Task "${tasksheet.taskName.name}" has been marked as ${statusText} by ${currentUser.name}.`;
        
        // Collect all users to notify (using Set to avoid duplicates)
        const usersToNotify = new Set();
        
        // ONLY notify the task assigner (the person who assigned the task)
        if (tasksheet.assignedBy) {
            const assignerId = tasksheet.assignedBy._id ? tasksheet.assignedBy._id.toString() : tasksheet.assignedBy.toString();
            
            // Don't notify if the assigner is the same person who's updating the status
            if (assignerId !== currentUserId.toString()) {
                usersToNotify.add(assignerId);
                console.log(`Added task assigner to notification list: ${tasksheet.assignedBy.name || assignerId}`);
            }
        }
        
        console.log(`Total unique users to notify: ${usersToNotify.size}`);
        
        // Send notifications to all unique users
        for (const userId of usersToNotify) {
            await sendNotificationToUser(
                userId,
                message,
                currentUserId,
                currentUser.name,
                currentUser.profilePic
            );
        }
        
    } catch (error) {
        console.error('Error in handleStatusChangeNotifications:', error);
    }
};

exports.showAll = async (req, res) => {
    try {
        const { taskId } = req.params;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { task: taskId };

        const actions = await Action.find(query)
            .skip(skip)
            .limit(limit)
            .populate('actionBy', 'name')
            .populate('task', 'taskStatus')
            .lean();

        if (actions.length <= 0) {
            return res.status(404).json({success: false, message: "No Actions Available"});
        }

        const totalRecords = await Action.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.status(200).json({
            success: true,
            actions,
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
        res.status(500).json({
            error: "Error while fetching the Tasksheet Actions : " + error.message,
        });
    }
};

exports.update = async (req, res) => {
    try {
        const {id} = req.params;
        const {task, action, startTime, endTime, taskStatus, complated} = req.body;
        
        const updatedData = {
            action,
            startTime,
            endTime,
            complated,
            taskStatus
        };
        
        // Get the current action to check if status is changing
        const currentAction = await Action.findById(id);
        const currentStatus = currentAction ? currentAction.taskStatus : null;
        
        // Update the action
        const newAction = await Action.findByIdAndUpdate(id, updatedData, {new: true, runValidators: true});
        
        if (!newAction) {
            return res.status(404).json({success: false, error: "action not found..."});
        }
        
        // Get and update tasksheet
        const tasksheet = await TaskSheet.findById(task)
            .populate('taskName')
            .populate('employees')
            .populate({ path: 'assignedBy', strictPopulate: false })
            .populate({ path: 'createdBy', strictPopulate: false });
        
        tasksheet.taskStatus = taskStatus;
        tasksheet.taskLevel = complated;
        
        // Use validateBeforeSave: false to bypass date validation
        await tasksheet.save({ validateBeforeSave: false });
        
        // Handle notifications for status changes
        await handleStatusChangeNotifications(taskStatus, currentStatus, tasksheet, req.user._id);
        
        res.status(200).json({success: true, message: "Action Updated..."});
    } catch (error) {
        console.error("Error in update action:", error);
        res.status(500).json({
            error: "Error while Updating the Tasksheet Action : " + error.message,
        });
    }
};

exports.create = async (req, res) => {
    try {
        const {task, action, startTime, endTime, taskStatus, taskLevel, remark} = req.body;
        
        // Get tasksheet details
        const tasksheet = await TaskSheet.findById(task)
            .populate('taskName')
            .populate('employees')
            .populate({ path: 'assignedBy', strictPopulate: false })
            .populate({ path: 'createdBy', strictPopulate: false });

        // Create new action
        const newAction = new Action({
            task,
            action,
            actionBy: req.user._id,
            startTime,
            endTime,
            complated: taskLevel,
            taskStatus,
            remark
        });

        // Update tasksheet - only update taskStatus and taskLevel, not dates
        if (taskStatus === 'completed') {
            tasksheet.taskStatus = taskStatus;
            tasksheet.taskLevel = 100;
            // Only update actualEndDate if it's not already set
            if (!tasksheet.actualEndDate) {
                tasksheet.actualEndDate = endTime;
            }
        } else {
            tasksheet.taskLevel = taskLevel;
            tasksheet.taskStatus = taskStatus;
        }
        
        // Use validateBeforeSave: false to bypass date validation
        await tasksheet.save({ validateBeforeSave: false });
        
        if (!newAction) {
            return res.status(400).json({success: false, error: "Action was not created"});
        }
        
        await newAction.save();
        
        // Handle notifications for status changes (no previous status for new action)
        await handleStatusChangeNotifications(taskStatus, null, tasksheet, req.user._id);
        
        res.status(200).json({success: true, message: "Action Created"});
    } catch (error) {
        console.error("Error in create action:", error);
        res.status(500).json({
            error: "Error while Creating the Tasksheet Action : " + error.message,
        });
    }
};

exports.delete = async (req, res) => {
    try {
        const {id} = req.params;
        const action = await Action.findByIdAndDelete(id);
        
        if (!action) {
            return res.status(404).json({success: false, error: "Action not found..."});
        }
        
        res.status(200).json({success: true, message: "Action Deleted Successfully..."});
    } catch (error) {
        res.status(500).json({
            error: "Error while deleting the Tasksheet Action : " + error.message,
        });
    }
};