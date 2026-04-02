const jwt = require("jsonwebtoken");
const Feedback = require("../models/feedbackModel");
const Service = require("../models/serviceModel");
const Employee = require("../models/employeeModel");
const Designation = require("../models/designationModel");
const { sendFeedbackNotification } = require("../mailsService/feedbackEmailService");
const { sendLowRatingAlert } = require("../mailsService/lowRatingAlertService");

// ─── Designations that receive low-rating (1-star) alert emails ────────────
const MANAGEMENT_DESIGNATION_NAMES = [
    'Director Customer Delight',
    'CEO & Founder',
    'Director Digi Solution',
    'Executive Director-Project',
];

// ─── Helper: fetch management employees by designation names ──────────────
const getManagementEmployees = async (companyId) => {
    try {
        const designations = await Designation.find({
            name: { $in: MANAGEMENT_DESIGNATION_NAMES },
            company: companyId
        }).lean();

        if (!designations.length) return [];

        const designationIds = designations.map(d => d._id);

        const employees = await Employee.find({
            designation: { $in: designationIds },
            company: companyId,
            email: { $exists: true, $ne: null, $ne: '' }
        })
            .select('name email designation')
            .populate('designation', 'name')
            .lean();

        return employees;
    } catch (err) {
        console.error("Error fetching management employees:", err);
        return [];
    }
};

exports.showAll = async (req, res) => {
    try {
        const user = req.user;

        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const query = { company: user.company ? user.company : user._id };

        const feedbacks = await Feedback.find(query)
            .skip(skip)
            .limit(limit)
            .populate("service")
            .lean();

        const totalRecords = await Feedback.countDocuments(query);
        const totalPages   = Math.ceil(totalRecords / limit);

        res.status(200).json({
            success: true,
            feedbacks: feedbacks || [],
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
        console.error("Error while fetching feedbacks: ", error);
        res.status(500).json({
            success: false,
            error: "Error while fetching the Feedbacks: " + error.message,
        });
    }
};

exports.create = async (req, res) => {
    try {
        const { rating, message, service, submitBy } = req.body;

        const existingService = await Service.findById(service)
            .populate('allotTo')
            .lean();
        if (!existingService) {
            return res.status(404).json({ success: false, error: "Invalid Ticket" });
        }

        let user = null;
        if (submitBy === "Employee") {
            const token = req.headers["authorization"]?.split(" ")[1];
            if (!token) return res.status(403).json({ error: "Unauthorized — login required" });
            const userId = jwt.verify(token, process.env.JWT_SECRET).user;
            user = await Employee.findById(userId);
            if (!user) return res.status(404).json({ success: false, error: "Invalid Employee" });
        }

        if (existingService.feedback) {
            return res.status(400).json({ success: false, error: "Feedback already given for this ticket" });
        }

        const newFeedback = new Feedback({
            rating,
            message,
            service,
            submmitedBy: submitBy === "Employee" ? user._id : null,
            company: existingService.company,
        });

        // We need the mutable service doc to save feedback ref
        const serviceMutable = await Service.findById(service).populate('allotTo');
        serviceMutable.feedback = newFeedback._id;

        await newFeedback.save();
        await serviceMutable.save();

        // ── Standard feedback notification ──────────────────────────────────
        sendFeedbackNotification({
            rating, message,
            service: existingService,
            submitBy,
            isNewFeedback: true,
        }).catch(err => console.error("Feedback notification error:", err));

        // ── 1-Star Low Rating Alert ─────────────────────────────────────────
        if (parseInt(rating) === 1) {
            (async () => {
                try {
                    const managementEmployees = await getManagementEmployees(existingService.company);
                    await sendLowRatingAlert({
                        rating,
                        message,
                        service: existingService,
                        submitBy,
                        managementEmployees,
                        isNewFeedback: true,
                    });
                } catch (err) {
                    console.error("Low rating alert error (create):", err);
                }
            })();
        }

        res.status(200).json({ success: true, message: "Thank you for your valuable feedback" });
    } catch (error) {
        console.error("Error while creating Feedback:", error);
        res.status(500).json({ success: false, error: "Error while creating feedback: " + error.message });
    }
};

exports.update = async (req, res) => {
    try {
        const { rating, message, service, submitBy } = req.body;

        const existingService = await Service.findById(service).populate('allotTo');
        if (!existingService) {
            return res.status(404).json({ success: false, error: "Invalid Ticket" });
        }

        let user = null;
        if (submitBy === "Employee") {
            const token = req.headers["authorization"]?.split(" ")[1];
            if (!token) return res.status(403).json({ error: "Unauthorized — login required" });
            const userId = jwt.verify(token, process.env.JWT_SECRET).user;
            user = await Employee.findById(userId);
            if (!user) return res.status(404).json({ success: false, error: "Invalid Employee" });
        }

        // ── CREATE path (no existing feedback) ─────────────────────────────
        if (!existingService.feedback) {
            const newFeedback = new Feedback({
                rating,
                message,
                service,
                submmitedBy: submitBy === "Employee" ? user._id : null,
                company: existingService.company,
            });
            existingService.feedback = newFeedback._id;
            await newFeedback.save();
            await existingService.save();

            sendFeedbackNotification({
                rating, message,
                service: existingService,
                submitBy,
                isNewFeedback: true,
            }).catch(err => console.error("Feedback notification error:", err));

            // 1-Star alert
            if (parseInt(rating) === 1) {
                (async () => {
                    try {
                        const managementEmployees = await getManagementEmployees(existingService.company);
                        await sendLowRatingAlert({
                            rating, message,
                            service: existingService,
                            submitBy,
                            managementEmployees,
                            isNewFeedback: true,
                        });
                    } catch (err) {
                        console.error("Low rating alert error (update-create):", err);
                    }
                })();
            }

            return res.status(200).json({ success: true, message: "Feedback created successfully" });
        }

        // ── UPDATE path (existing feedback) ────────────────────────────────
        const existingFeedback = await Feedback.findById(existingService.feedback);
        if (!existingFeedback) {
            return res.status(404).json({ success: false, error: "Feedback not found" });
        }

        const previousRating = existingFeedback.rating;
        existingFeedback.rating  = rating;
        existingFeedback.message = message;
        await existingFeedback.save();

        sendFeedbackNotification({
            rating, message,
            service: existingService,
            submitBy,
            isNewFeedback: false,
            previousRating,
        }).catch(err => console.error("Feedback notification error:", err));

        // 1-Star alert on update (only if newly 1-star or still 1-star)
        if (parseInt(rating) === 1) {
            (async () => {
                try {
                    const managementEmployees = await getManagementEmployees(existingService.company);
                    await sendLowRatingAlert({
                        rating, message,
                        service: existingService,
                        submitBy,
                        managementEmployees,
                        isNewFeedback: false,
                        previousRating,
                    });
                } catch (err) {
                    console.error("Low rating alert error (update):", err);
                }
            })();
        }

        res.status(200).json({ success: true, message: "Feedback updated successfully" });

    } catch (error) {
        console.error("Error while updating Feedback:", error);
        res.status(500).json({ success: false, error: "Error while updating feedback: " + error.message });
    }
};

exports.feedback = async (req, res) => {
    try {
        const user = req.user;

        let page  = parseInt(req.query.page)  || 1;
        let limit = parseInt(req.query.limit) || 10;
        let skip  = (page - 1) * limit;

        const { q } = req.query;

        const baseQuery = {
            company: user.company ? user.company : user._id,
            status: "Completed"
        };

        let services, totalRecords;

        if (q && q.trim() !== '' && q.trim().toLowerCase() !== 'null' && q.trim().toLowerCase() !== 'undefined') {
            const searchRegex = new RegExp(q, "i");

            const aggregatePipeline = [
                { $match: baseQuery },
                { $lookup: { from: "tickets",   localField: "ticket",  foreignField: "_id", as: "ticket"  } },
                { $unwind: "$ticket" },
                { $lookup: { from: "customers", localField: "ticket.client", foreignField: "_id", as: "ticket.client" } },
                { $unwind: "$ticket.client" },
                { $lookup: { from: "employees", localField: "allotTo", foreignField: "_id", as: "allotTo" } },
                {
                    $match: {
                        $or: [
                            { "ticket.client.custName":   { $regex: searchRegex } },
                            { "ticket.contactPerson":     { $regex: searchRegex } },
                            { "ticket.product":           { $regex: searchRegex } },
                            { "ticket.contactNumber":     { $regex: searchRegex } }
                        ]
                    }
                },
                {
                    $project: {
                        _id: 1, allotmentDate: 1, completionDate: 1, status: 1,
                        feedback: 1, company: 1, serviceType: 1, priority: 1,
                        workMode: 1, actualCompletionDate: 1,
                        "ticket._id": 1, "ticket.details": 1, "ticket.product": 1,
                        "ticket.date": 1, "ticket.contactNumber": 1, "ticket.contactPerson": 1,
                        "ticket.contactPersonEmail": 1,
                        "ticket.client._id": 1, "ticket.client.custName": 1,
                        "allotTo._id": 1, "allotTo.name": 1
                    }
                },
                { $skip: skip },
                { $limit: limit }
            ];

            // Populate feedback for each service
            services = await Service.aggregate(aggregatePipeline);
            // Manually populate feedback
            const feedbackIds = services.map(s => s.feedback).filter(Boolean);
            const { default: FeedbackModel } = await Promise.resolve().then(() => ({ default: Feedback }));
            const feedbacks = await FeedbackModel.find({ _id: { $in: feedbackIds } }).lean();
            const feedbackMap = {};
            feedbacks.forEach(f => { feedbackMap[f._id.toString()] = f; });
            services = services.map(s => ({
                ...s,
                feedback: s.feedback ? feedbackMap[s.feedback.toString()] || null : null
            }));

            const countPipeline = [
                { $match: baseQuery },
                { $lookup: { from: "tickets",   localField: "ticket",  foreignField: "_id", as: "ticket"  } },
                { $unwind: "$ticket" },
                { $lookup: { from: "customers", localField: "ticket.client", foreignField: "_id", as: "ticket.client" } },
                { $unwind: "$ticket.client" },
                {
                    $match: {
                        $or: [
                            { "ticket.client.custName":   { $regex: searchRegex } },
                            { "ticket.contactPerson":     { $regex: searchRegex } },
                            { "ticket.product":           { $regex: searchRegex } },
                            { "ticket.contactNumber":     { $regex: searchRegex } }
                        ]
                    }
                },
                { $count: "total" }
            ];
            const countResult = await Service.aggregate(countPipeline);
            totalRecords = countResult.length > 0 ? countResult[0].total : 0;

        } else {
            services = await Service.find(baseQuery)
                .skip(skip)
                .limit(limit)
                .populate("allotTo", "name")
                .populate({
                    path: "ticket",
                    select: "details product date client contactNumber contactPerson contactPersonEmail",
                    populate: { path: "client", select: "custName" }
                })
                .populate("feedback")
                .lean();

            totalRecords = await Service.countDocuments(baseQuery);
        }

        const totalPages = Math.ceil(totalRecords / limit);

        res.status(200).json({
            success: true,
            services: services || [],
            currentPage: page,
            totalPages,
            totalRecords,
            limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        });
    } catch (error) {
        console.error("Error while getting feedback: ", error);
        res.status(500).json({ success: false, error: "Error while getting feedback: " + error.message });
    }
};