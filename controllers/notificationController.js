const jwt = require('jsonwebtoken');
const Notification = require('../models/notificationModel');
const {admin} = require('../utils/firebase');
const Employee = require('../models/employeeModel');

exports.showAll = async (req,res)=>{
    try {
        // Get all notifications for the current user (both seen and unseen)
        const notifications = await Notification.find({userIds:req.user._id})
            .populate('sender', 'name profilePic')
            .sort({ createdAt: -1 });
            
        if(!notifications || notifications.length === 0){
            return res.status(200).json({notifications:[], success:true});
        }
        res.status(200).json({notifications, success:true,});
    }catch (error) {
        console.log(error);
        res
      .status(500).json({
        error: "Error while featching the Notifications: " + error.message,
      });
    }
}

exports.create= async(req, res, io)=>{
    try {
        const user= req.user;
        const {message, userIds} = req.body;
        
        // Validate that userIds is provided
        if (!userIds) {
            return res.status(400).json({success:false, error: "User ID is required." });
        }
        
        const employee = await Employee.findById(userIds);
        if (!employee) {
            return res.status(404).json({success:false, error: "Employee not found." });
        }
      
        const newNotification = await Notification({
            message,
            userIds,
            sender:user._id
        });
        
        await newNotification.save();
        
        // Populate sender details before sending response
        await newNotification.populate('sender', 'name profilePic');
        
        // Send FCM notification if employee has a token
        if (employee.fcmToken) {
            const messagePayload = {
                notification: {
                    title: `Task Status Update`,
                    body: message,
                },
                token: employee.fcmToken,
                data: {
                    sender: user.name,
                    profilePic: user.profilePic,
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
        
        // Emit socket event for real-time notification
        if (io) {
            // Convert userIds to string for socket room
            const room = userIds.toString();
            io.to(room).emit('newNotification', newNotification);
            console.log(`Notification sent to room: ${room}`);
        }
        
        res.status(200).json({newNotification, success:true,});
    
    } catch (error) {
        console.log(error);
        res
      .status(500).json({
        error: "Error while creating the Notification: " + error.message,
      });
    }
}

exports.markAsRead = async(req, res)=>{
    try {
        const {id} = req.params;
        const notification = await Notification.findById(id);
        if(!notification){
            return res.status(404).json({success:false, message:"Notification not found"});
        }
        notification.isSeen = true;
        await notification.save();
        res.status(200).json({notification, success:true,});
    }
    catch (error) {
        res.status(500).json({
            error: "Error while updating the Notification: " + error.message,
          });
    }
}

exports.delete = async(req, res) => {
    try {
        const {id} = req.params;
        const notification = await Notification.findByIdAndDelete(id);
        
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