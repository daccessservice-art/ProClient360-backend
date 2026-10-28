const { Types } = require('mongoose');
const Notification = require('../models/notificationModel');
const { NOTIFICATION_TYPES } = require('../models/notificationModel');
const {admin} = require('../utils/firebase');
const Employee = require('../models/employeeModel');

const LEAD_TYPES = ['lead_assigned', 'lead_reassigned', 'lead_transferred', 'survey_assigned', 'survey_submitted'];

// ── helper: build filter from query (?type=lead_assigned  or  ?category=sales  or  ?unread=true)
const buildFilter = (req) => {
    const filter = { userIds: req.user._id };
    const { type, category, unread } = req.query;

    if (type && NOTIFICATION_TYPES.includes(type)) filter.type = type;
    if (category === 'sales') filter.type = { $in: LEAD_TYPES };
    if (unread === 'true') filter.isSeen = false;
    return filter;
};

// ── helper: sender display name (company users are not in Employee collection)
const shape = (n) => {
    const obj = n.toObject ? n.toObject() : n;
    if (!obj.sender || !obj.sender.name) {
        obj.sender = { _id: obj.sender?._id || obj.sender || null, name: obj.senderName || 'System', profilePic: obj.sender?.profilePic || '' };
    }
    return obj;
};

// ════════════════════════════════════════════════════════════════════
// GET /api/notification
//   Web: unchanged response shape { success, notifications }
//   Mobile: supports ?page=1&limit=20&type=lead_assigned&category=sales&unread=true
// ════════════════════════════════════════════════════════════════════
exports.showAll = async (req,res)=>{
    try {
        const filter = buildFilter(req);
        const page  = parseInt(req.query.page)  || 1;
        const limit = Math.min(parseInt(req.query.limit) || 100, 200);
        const skip  = (page - 1) * limit;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .populate('sender', 'name profilePic')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Notification.countDocuments(filter),
            Notification.countDocuments({ userIds: req.user._id, isSeen: false }),
        ]);

        res.status(200).json({
            success: true,
            notifications: notifications.map(shape),
            unreadCount,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalRecords: total,
                limit,
                hasNextPage: page * limit < total,
            },
        });
    }catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Error while featching the Notifications: " + error.message,
        });
    }
}

// ════════════════════════════════════════════════════════════════════
// ✅ NEW  GET /api/notification/unread-count
//   → { success, unreadCount, salesUnreadCount }
//   Used by web bell badge polling + mobile app badge
// ════════════════════════════════════════════════════════════════════
exports.unreadCount = async (req, res) => {
    try {
        const [unreadCount, salesUnreadCount] = await Promise.all([
            Notification.countDocuments({ userIds: req.user._id, isSeen: false }),
            Notification.countDocuments({ userIds: req.user._id, isSeen: false, type: { $in: LEAD_TYPES } }),
        ]);
        res.status(200).json({ success: true, unreadCount, salesUnreadCount });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error while counting notifications: " + error.message });
    }
};

exports.create= async(req, res, io)=>{
    try {
        const user= req.user;
        const {message, userIds, title} = req.body;

        if (!userIds) {
            return res.status(400).json({success:false, error: "User ID is required." });
        }

        const employee = await Employee.findById(userIds);
        if (!employee) {
            return res.status(404).json({success:false, error: "Employee not found." });
        }

        const newNotification = new Notification({
            message,
            title: title || 'Task Status Update',
            type: 'general',
            userIds,
            sender:user._id,
            senderName: user.name || '',
        });

        await newNotification.save();
        await newNotification.populate('sender', 'name profilePic');

        if (employee.fcmToken) {
            const messagePayload = {
                notification: {
                    title: newNotification.title,
                    body: message,
                },
                token: employee.fcmToken,
                data: {
                    notificationId: String(newNotification._id),
                    type: 'general',
                    sender: String(user.name || ''),
                    profilePic: String(user.profilePic || ''),
                    message: String(message),
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

        if (io) {
            const room = userIds.toString();
            io.to(room).emit('newNotification', newNotification);
            console.log(`Notification sent to room: ${room}`);
        }

        res.status(200).json({newNotification: shape(newNotification), success:true,});

    } catch (error) {
        console.log(error);
        res.status(500).json({
            error: "Error while creating the Notification: " + error.message,
        });
    }
}

// PUT /api/notification/:id   → mark one as read (only own notification)
exports.markAsRead = async(req, res)=>{
    try {
        const {id} = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success:false, error: "Invalid notification id" });
        }
        const notification = await Notification.findOneAndUpdate(
            { _id: id, userIds: req.user._id },
            { $set: { isSeen: true } },
            { new: true }
        );
        if(!notification){
            return res.status(404).json({success:false, message:"Notification not found"});
        }
        res.status(200).json({notification, success:true,});
    }
    catch (error) {
        res.status(500).json({
            error: "Error while updating the Notification: " + error.message,
        });
    }
}

// ✅ NEW  PUT /api/notification/mark-all-read   (optional ?category=sales)
exports.markAllAsRead = async (req, res) => {
    try {
        const filter = { userIds: req.user._id, isSeen: false };
        if (req.query.category === 'sales') filter.type = { $in: LEAD_TYPES };
        const result = await Notification.updateMany(filter, { $set: { isSeen: true } });
        res.status(200).json({ success: true, modifiedCount: result.modifiedCount, message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error while marking notifications: " + error.message });
    }
};

// DELETE /api/notification/:id   (only own notification)
exports.delete = async(req, res) => {
    try {
        const {id} = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success:false, error: "Invalid notification id" });
        }
        const notification = await Notification.findOneAndDelete({ _id: id, userIds: req.user._id });

        if(!notification){
            return res.status(404).json({success:false, message:"Notification not found"});
        }

        res.status(200).json({success:true, message:"Notification deleted successfully"});
    } catch (error) {
        res.status(500).json({
            error: "Error while deleting the Notification: " + error.message,
        });
    }
}

// ✅ NEW  DELETE /api/notification/clear-all
exports.clearAll = async (req, res) => {
    try {
        const result = await Notification.deleteMany({ userIds: req.user._id });
        res.status(200).json({ success: true, deletedCount: result.deletedCount, message: "All notifications cleared" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error while clearing notifications: " + error.message });
    }
};

// ✅ NEW  PUT /api/notification/fcm-token   body: { fcmToken }
//   Mobile app calls this after login / on token refresh.
//   Send { fcmToken: null } on logout to stop pushes on that device.
exports.saveFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        const user = req.user;

        if (fcmToken !== null && (typeof fcmToken !== 'string' || fcmToken.trim().length < 10)) {
            return res.status(400).json({ success: false, error: "Valid fcmToken is required." });
        }

        // Company login is not an Employee — nothing to save
        const result = await Employee.updateOne(
            { _id: user._id },
            { $set: { fcmToken: fcmToken ? fcmToken.trim() : null } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, error: "Only employee accounts can receive push notifications." });
        }

        // one device token should belong to one employee only
        if (fcmToken) {
            await Employee.updateMany(
                { _id: { $ne: user._id }, fcmToken: fcmToken.trim() },
                { $set: { fcmToken: null } }
            );
        }

        res.status(200).json({ success: true, message: fcmToken ? "FCM token saved" : "FCM token removed" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error while saving FCM token: " + error.message });
    }
};