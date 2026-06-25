const jwt = require("jsonwebtoken");
const CallLog = require("../models/callLogModel");
const Service = require("../models/serviceModel");
const Employee = require("../models/employeeModel");

exports.create = async (req, res) => {
    try {
        const { service, callDateTime, callStatus, callDuration, notes, customerResponse } = req.body;

        if (!service || !callDateTime || !callStatus) {
            return res.status(400).json({ success: false, error: "Service, call date/time, and call status are required" });
        }

        const existingService = await Service.findById(service);
        if (!existingService) {
            return res.status(404).json({ success: false, error: "Service not found" });
        }

        const token = req.headers["authorization"]?.split(" ")[1];
        if (!token) return res.status(403).json({ success: false, error: "Unauthorized" });
        const userId = jwt.verify(token, process.env.JWT_SECRET).user;
        const user = await Employee.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: "Employee not found" });

        const newCallLog = new CallLog({
            company: existingService.company,
            service,
            calledBy: user._id,
            callDateTime: new Date(callDateTime),
            callStatus,
            callDuration: callDuration || 0,
            notes: notes || '',
            customerResponse: customerResponse || '',
        });

        await newCallLog.save();
        await newCallLog.populate('calledBy', 'name');

        res.status(200).json({ success: true, message: "Call log added successfully", callLog: newCallLog });
    } catch (error) {
        console.error("Error creating call log:", error);
        res.status(500).json({ success: false, error: "Error creating call log: " + error.message });
    }
};

exports.getByService = async (req, res) => {
    try {
        const { serviceId } = req.params;

        const callLogs = await CallLog.find({ service: serviceId })
            .populate('calledBy', 'name')
            .sort({ callDateTime: -1 })
            .lean();

        const totalCalls = callLogs.length;
        const answeredCalls = callLogs.filter(c => c.callStatus === 'Answered').length;
        const lastCall = callLogs.length > 0 ? callLogs[0] : null;

        res.status(200).json({
            success: true,
            callLogs: callLogs || [],
            summary: {
                totalCalls,
                answeredCalls,
                notAnsweredCalls: totalCalls - answeredCalls,
                lastCallDateTime: lastCall?.callDateTime || null,
                lastCallStatus: lastCall?.callStatus || null,
            }
        });
    } catch (error) {
        console.error("Error fetching call logs:", error);
        res.status(500).json({ success: false, error: "Error fetching call logs: " + error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const { callDateTime, callStatus, callDuration, notes, customerResponse } = req.body;
        const { id } = req.params;

        const callLog = await CallLog.findById(id);
        if (!callLog) {
            return res.status(404).json({ success: false, error: "Call log not found" });
        }

        if (callDateTime) callLog.callDateTime = new Date(callDateTime);
        if (callStatus) callLog.callStatus = callStatus;
        if (callDuration !== undefined) callLog.callDuration = callDuration;
        if (notes !== undefined) callLog.notes = notes;
        if (customerResponse !== undefined) callLog.customerResponse = customerResponse;

        await callLog.save();
        await callLog.populate('calledBy', 'name');

        res.status(200).json({ success: true, message: "Call log updated successfully", callLog });
    } catch (error) {
        console.error("Error updating call log:", error);
        res.status(500).json({ success: false, error: "Error updating call log: " + error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const { id } = req.params;

        const callLog = await CallLog.findById(id);
        if (!callLog) {
            return res.status(404).json({ success: false, error: "Call log not found" });
        }

        await CallLog.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: "Call log deleted successfully" });
    } catch (error) {
        console.error("Error deleting call log:", error);
        res.status(500).json({ success: false, error: "Error deleting call log: " + error.message });
    }
};

exports.summary = async (req, res) => {
    try {
        const user = req.user;
        const companyId = user.company ? user.company : user._id;

        const pipeline = [
            { $match: { company: companyId } },
            { $sort: { callDateTime: -1 } },
            {
                $group: {
                    _id: "$service",
                    totalCalls: { $sum: 1 },
                    answeredCalls: {
                        $sum: { $cond: [{ $eq: ["$callStatus", "Answered"] }, 1, 0] }
                    },
                    lastCallDateTime: { $first: "$callDateTime" },
                    lastCallStatus: { $first: "$callStatus" },
                }
            }
        ];

        const summaries = await CallLog.aggregate(pipeline);

        res.status(200).json({ success: true, summaries });
    } catch (error) {
        console.error("Error fetching call log summary:", error);
        res.status(500).json({ success: false, error: "Error fetching call log summary: " + error.message });
    }
};

exports.stats = async (req, res) => {
    try {
        const user = req.user;
        const companyId = user.company ? user.company : user._id;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalAll, totalToday, totalWeek, totalMonth, answeredAll] = await Promise.all([
            CallLog.countDocuments({ company: companyId }),
            CallLog.countDocuments({ company: companyId, callDateTime: { $gte: todayStart } }),
            CallLog.countDocuments({ company: companyId, callDateTime: { $gte: weekStart } }),
            CallLog.countDocuments({ company: companyId, callDateTime: { $gte: monthStart } }),
            CallLog.countDocuments({ company: companyId, callStatus: "Answered" }),
        ]);

        const answerRate = totalAll > 0 ? ((answeredAll / totalAll) * 100).toFixed(1) : 0;

        res.status(200).json({
            success: true,
            stats: {
                totalAll,
                totalToday,
                totalWeek,
                totalMonth,
                answeredAll,
                notAnsweredAll: totalAll - answeredAll,
                answerRate: parseFloat(answerRate),
            }
        });
    } catch (error) {
        console.error("Error fetching call stats:", error);
        res.status(500).json({ success: false, error: "Error fetching call stats: " + error.message });
    }
};