const ProjectPurchase = require('../models/projectPurchaseModel');
const Project = require('../models/projectModel');
const AccountMaster = require('../models/accountMasterModel');
const { logCreation, logUpdate } = require('../helpers/activityLogHelper');
const { bucket } = require('../utils/firebase');
const mongoose = require('mongoose');

// ─── Helper: Safely extract Company ID ─────────────────────────────────
const getCompanyId = (user) => {
    if (user.company) {
        // If populated, it's an object; otherwise it's an ObjectId string
        return typeof user.company === 'object' ? user.company._id : user.company;
    }
    // If user IS the company admin
    return user._id;
};

// ─── Create Project Purchase Request ────────────────────────────────
exports.create = async (req, res) => {
    try {
        const user = req.user;
        const { projectId, materials, remark } = req.body;

        if (!projectId) {
            return res.status(400).json({ success: false, error: 'Project ID is required' });
        }
        if (!materials || !Array.isArray(materials) || materials.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one material is required' });
        }

        // Fetch project (READ-ONLY - we do NOT update the project)
        const project = await Project.findById(projectId).populate('custId', 'custName').lean();
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const companyId = getCompanyId(user);

        // Check if a purchase request already exists for this project
        const existingRequest = await ProjectPurchase.findOne({ projectId, status: { $ne: 'Completed' } });
        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: 'An active purchase request already exists for this project. Please update the existing one.'
            });
        }

        // Snapshot payment terms from Project Master (READ-ONLY)
        const paymentTerms = {
            advancePay: project.advancePay || 0,
            payAgainstDelivery: project.payAgainstDelivery || 0,
            payAfterCompletion: project.payAfterCompletion || 0,
            retention: project.retention || 0
        };

        // Process materials
        const processedMaterials = materials.map(m => ({
            productName: m.productName,
            description: m.description || '',
            quantity: Number(m.quantity),
            unit: m.unit || 'Nos',
            estimatedPrice: Number(m.estimatedPrice) || 0,
            stockStatus: 'Pending',
            availableQuantity: 0,
            purchaseRequired: false,
            purchaseStatus: 'Not Required'
        }));

        const newPurchase = new ProjectPurchase({
            projectId,
            company: companyId,
            requestedBy: user._id,
            requestDate: new Date(),
            materials: processedMaterials,
            paymentTerms,
            accountVerification: {
                advancePaymentReceived: false,
                advancePaymentAmount: 0,
                invoiceGenerated: false,
                paymentTermsMatch: 'Pending'
            },
            status: 'Store Check Pending',
            remark: remark || '',
            createdBy: user._id
        });

        const saved = await newPurchase.save();
        await logCreation(saved, user, req, 'ProjectPurchase');

        res.status(201).json({
            success: true,
            message: 'Project purchase request created successfully',
            projectPurchase: saved
        });
    } catch (error) {
        console.error('Error in projectPurchase create:', error);
        res.status(500).json({ error: 'Error creating purchase request: ' + error.message });
    }
};

// ─── Get All Project Purchases ──────────────────────────────────────
exports.getAll = async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const { status, stockStatus, search, paymentTermsMatch } = req.query;

        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));
        let query = { company: companyId };

        if (status) {
            query.status = status;
        }
        if (stockStatus) {
            query['materials.stockStatus'] = stockStatus;
        }
        if (paymentTermsMatch) {
            query['accountVerification.paymentTermsMatch'] = paymentTermsMatch;
        }
        if (search && search.trim() !== '') {
            const projects = await Project.find({
                company: companyId,
                $or: [
                    { name: { $regex: search.trim(), $options: 'i' } },
                    { purchaseOrderNo: { $regex: search.trim(), $options: 'i' } }
                ]
            }).select('_id');
            const projectIds = projects.map(p => p._id);
            if (projectIds.length > 0) {
                query.projectId = { $in: projectIds };
            } else {
                return res.status(200).json({
                    success: true,
                    projectPurchases: [],
                    pagination: { currentPage: page, totalPages: 0, totalRecords: 0, limit, hasNextPage: false, hasPrevPage: false }
                });
            }
        }

        const projectPurchases = await ProjectPurchase.find(query)
            .skip(skip)
            .limit(limit)
            .populate('projectId', 'name purchaseOrderNo purchaseOrderValue projectStatus completeLevel advancePay payAgainstDelivery payAfterCompletion retention category custId')
            .populate('requestedBy', 'name')
            .populate('createdBy', 'name')
            .populate('accountVerification.advancePaymentVerifiedBy', 'name')
            .populate('accountVerification.verifiedBy', 'name')
            .populate('materials.stockCheckedBy', 'name')
            .populate('materials.vendorId', 'vendorName')
            .sort({ createdAt: -1 })
            .lean();

        // Enrich with customer name
        const Customer = require('../models/customerModel');
        const enrichedPurchases = await Promise.all(projectPurchases.map(async (pp) => {
            if (pp.projectId?.custId) {
                const customer = await Customer.findById(pp.projectId.custId).select('custName').lean();
                pp.customerName = customer?.custName || 'N/A';
            } else {
                pp.customerName = 'N/A';
            }
            return pp;
        }));

        const totalRecords = await ProjectPurchase.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        res.status(200).json({
            success: true,
            projectPurchases: enrichedPurchases,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error in projectPurchase getAll:', error);
        res.status(500).json({ error: 'Error fetching purchase requests: ' + error.message });
    }
};

// ─── Get Single Project Purchase ────────────────────────────────────
exports.getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const projectPurchase = await ProjectPurchase.findById(id)
            .populate('projectId', 'name purchaseOrderNo purchaseOrderValue projectStatus completeLevel advancePay payAgainstDelivery payAfterCompletion retention category custId')
            .populate('requestedBy', 'name')
            .populate('createdBy', 'name')
            .populate('accountVerification.advancePaymentVerifiedBy', 'name')
            .populate('accountVerification.verifiedBy', 'name')
            .populate('materials.stockCheckedBy', 'name')
            .populate('materials.vendorId', 'vendorName')
            .lean();

        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        // Fetch customer name
        if (projectPurchase.projectId?.custId) {
            const Customer = require('../models/customerModel');
            const customer = await Customer.findById(projectPurchase.projectId.custId).select('custName').lean();
            projectPurchase.customerName = customer?.custName || 'N/A';
        } else {
            projectPurchase.customerName = 'N/A';
        }

        res.status(200).json({ success: true, projectPurchase });
    } catch (error) {
        console.error('Error in projectPurchase getOne:', error);
        res.status(500).json({ error: 'Error fetching purchase request: ' + error.message });
    }
};

// ─── Store Team: Check Material Availability ────────────────────────
exports.storeCheck = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { materials } = req.body;

        if (!materials || !Array.isArray(materials)) {
            return res.status(400).json({ success: false, error: 'Materials data is required' });
        }

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        // Update each material's stock status
        materials.forEach((checkData) => {
            const material = projectPurchase.materials.id(checkData.materialId);
            if (material) {
                material.stockStatus = checkData.stockStatus;
                material.availableQuantity = checkData.availableQuantity || 0;
                material.stockCheckedBy = user._id;
                material.stockCheckedDate = new Date();
                material.stockRemark = checkData.stockRemark || '';

                // Auto-set purchase required
                if (checkData.stockStatus === 'Not Available') {
                    material.purchaseRequired = true;
                    material.purchaseStatus = 'Pending';
                } else if (checkData.stockStatus === 'Partial') {
                    material.purchaseRequired = true;
                    material.purchaseStatus = 'Pending';
                } else if (checkData.stockStatus === 'Available') {
                    material.purchaseRequired = false;
                    material.purchaseStatus = 'Not Required';
                }
            }
        });

        // Determine overall status
        const allChecked = projectPurchase.materials.every(m => m.stockStatus !== 'Pending');
        const anyNotAvailable = projectPurchase.materials.some(m => m.stockStatus === 'Not Available' || m.stockStatus === 'Partial');
        const allAvailable = projectPurchase.materials.every(m => m.stockStatus === 'Available');

        if (allChecked) {
            if (allAvailable) {
                projectPurchase.status = 'Store Verified - Available';
            } else if (anyNotAvailable) {
                projectPurchase.status = 'Store Verified - Not Available';
                const needsPurchase = projectPurchase.materials.some(m => m.purchaseRequired);
                if (needsPurchase) {
                    projectPurchase.status = 'Purchase Pending';
                }
            }
        }

        const updated = await projectPurchase.save();
        await logUpdate({ status: 'Store Check Pending' }, { status: updated.status }, user, req, 'ProjectPurchase');

        res.status(200).json({
            success: true,
            message: 'Material availability updated successfully',
            projectPurchase: updated
        });
    } catch (error) {
        console.error('Error in storeCheck:', error);
        res.status(500).json({ error: 'Error updating stock status: ' + error.message });
    }
};

// ─── Purchase Team: Update Purchase Status ──────────────────────────
exports.updatePurchase = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { materials } = req.body;

        if (!materials || !Array.isArray(materials)) {
            return res.status(400).json({ success: false, error: 'Materials data is required' });
        }

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        materials.forEach((purchaseData) => {
            const material = projectPurchase.materials.id(purchaseData.materialId);
            if (material) {
                material.purchaseStatus = purchaseData.purchaseStatus || material.purchaseStatus;
                material.vendorId = purchaseData.vendorId || material.vendorId;
                material.purchaseOrderRef = purchaseData.purchaseOrderRef || material.purchaseOrderRef;
                material.purchaseDate = purchaseData.purchaseDate ? new Date(purchaseData.purchaseDate) : material.purchaseDate;
                material.expectedDeliveryDate = purchaseData.expectedDeliveryDate ? new Date(purchaseData.expectedDeliveryDate) : material.expectedDeliveryDate;
                material.actualDeliveryDate = purchaseData.actualDeliveryDate ? new Date(purchaseData.actualDeliveryDate) : material.actualDeliveryDate;
                material.purchaseRemark = purchaseData.purchaseRemark || material.purchaseRemark;

                if (purchaseData.purchaseStatus === 'Delivered') {
                    material.stockStatus = 'Available';
                    material.availableQuantity = material.quantity;
                    material.purchaseRequired = false;
                }
            }
        });

        const allDeliveredOrNotRequired = projectPurchase.materials.every(
            m => m.purchaseStatus === 'Delivered' || m.purchaseStatus === 'Not Required'
        );
        const anyOrdered = projectPurchase.materials.some(m => m.purchaseStatus === 'Ordered');
        const anyPending = projectPurchase.materials.some(m => m.purchaseStatus === 'Pending');

        if (allDeliveredOrNotRequired) {
            projectPurchase.status = 'Ready for Invoice';
        } else if (anyOrdered) {
            projectPurchase.status = 'Purchase Ordered';
        } else if (anyPending) {
            projectPurchase.status = 'Purchase Pending';
        }

        const updated = await projectPurchase.save();

        res.status(200).json({
            success: true,
            message: 'Purchase status updated successfully',
            projectPurchase: updated
        });
    } catch (error) {
        console.error('Error in updatePurchase:', error);
        res.status(500).json({ error: 'Error updating purchase status: ' + error.message });
    }
};

// ─── Accounts Team: Verify Payment & Generate Invoice ───────────────
exports.accountVerify = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const {
            advancePaymentReceived,
            advancePaymentAmount,
            advancePaymentDate,
            advancePaymentRemark,
            paymentTermsMatch,
            accountRemark,
            invoiceNumber,
            invoiceDate,
            invoicePdf
        } = req.body;

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        const oldVerification = { ...projectPurchase.accountVerification.toObject() };

        const project = await Project.findById(projectPurchase.projectId).lean();
        if (!project) {
            return res.status(404).json({ success: false, error: 'Associated project not found' });
        }

        let termsMatch = paymentTermsMatch || 'Pending';
        if (advancePaymentReceived && project.advancePay > 0) {
            const expectedAdvanceAmount = (project.purchaseOrderValue * project.advancePay) / 100;
            if (advancePaymentAmount >= expectedAdvanceAmount) {
                termsMatch = 'Matched';
            } else if (advancePaymentAmount > 0) {
                termsMatch = 'Partial';
            } else {
                termsMatch = 'Not Matched';
            }
        } else if (!advancePaymentReceived && project.advancePay > 0) {
            termsMatch = 'Not Matched';
        } else if (project.advancePay === 0) {
            termsMatch = 'Matched';
        }

        let invoicePdfUrl = projectPurchase.accountVerification.invoicePdf;
        if (invoicePdf && typeof invoicePdf === 'string' && invoicePdf.startsWith('data:')) {
            try {
                let base64String = invoicePdf.trim();
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
                const buffer = Buffer.from(base64String, 'base64');
                if (buffer.length > 5 * 1024 * 1024) {
                    return res.status(400).json({ success: false, error: 'Invoice PDF must be less than 5MB' });
                }
                const fileName = `ProjectPurchaseInvoices/${id}_${Date.now()}.pdf`;
                const file = bucket.file(fileName);
                await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
                await file.makePublic();
                invoicePdfUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            } catch (uploadError) {
                console.error('Error uploading invoice PDF:', uploadError);
                return res.status(400).json({ success: false, error: 'Failed to upload invoice PDF' });
            }
        }

        projectPurchase.accountVerification = {
            ...projectPurchase.accountVerification.toObject(),
            advancePaymentReceived: advancePaymentReceived !== undefined ? advancePaymentReceived : projectPurchase.accountVerification.advancePaymentReceived,
            advancePaymentAmount: advancePaymentAmount !== undefined ? Number(advancePaymentAmount) : projectPurchase.accountVerification.advancePaymentAmount,
            advancePaymentDate: advancePaymentDate ? new Date(advancePaymentDate) : projectPurchase.accountVerification.advancePaymentDate,
            advancePaymentRemark: advancePaymentRemark || projectPurchase.accountVerification.advancePaymentRemark,
            paymentTermsMatch: termsMatch,
            accountRemark: accountRemark || projectPurchase.accountVerification.accountRemark,
            invoiceGenerated: invoiceNumber ? true : projectPurchase.accountVerification.invoiceGenerated,
            invoiceNumber: invoiceNumber || projectPurchase.accountVerification.invoiceNumber,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : projectPurchase.accountVerification.invoiceDate,
            invoicePdf: invoicePdfUrl,
            advancePaymentVerifiedBy: user._id,
            verifiedBy: user._id,
            verifiedDate: new Date()
        };

        if (invoiceNumber) {
            projectPurchase.status = 'Invoice Generated';
        } else if (termsMatch === 'Matched' || termsMatch === 'Partial') {
            projectPurchase.status = 'Ready for Invoice';
        }

        const updated = await projectPurchase.save();

        if (termsMatch === 'Matched' || advancePaymentReceived) {
            try {
                const account = await AccountMaster.findOne({ projectId: projectPurchase.projectId });
                if (account) {
                    account.accountActions.advancePaymentReceived = Number(advancePaymentAmount) || account.accountActions.advancePaymentReceived;
                    account.accountActions.receivedAmount = (account.accountActions.receivedAmount || 0) + Number(advancePaymentAmount || 0);
                    const totalInvoiceAmount = account.basicAmount + (account.accountActions.taxAmount || 0);
                    account.accountActions.pendingAmount = Math.max(0, totalInvoiceAmount - account.accountActions.receivedAmount);

                    if (account.accountActions.pendingAmount <= 0) {
                        account.accountActions.invoiceStatus = 'Paid';
                    } else if (account.accountActions.receivedAmount > 0) {
                        account.accountActions.invoiceStatus = 'Partial';
                    }

                    if (invoiceNumber) {
                        account.accountActions.invoiceNumber = invoiceNumber;
                        account.accountActions.invoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();
                        account.accountActions.invoicePdf = invoicePdfUrl;
                    }
                    await account.save();
                }
            } catch (accErr) {
                console.error('Error updating Account Master:', accErr);
            }
        }

        await logUpdate(oldVerification, projectPurchase.accountVerification, user, req, 'ProjectPurchase');

        res.status(200).json({
            success: true,
            message: 'Account verification updated successfully',
            projectPurchase: updated
        });
    } catch (error) {
        console.error('Error in accountVerify:', error);
        res.status(500).json({ error: 'Error verifying account: ' + error.message });
    }
};

// ─── Get Material Status by Project (for Account Master) ───────────
exports.getMaterialStatusByProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        const projectPurchase = await ProjectPurchase.findOne({ projectId })
            .populate('materials.stockCheckedBy', 'name')
            .populate('materials.vendorId', 'vendorName')
            .sort({ createdAt: -1 })
            .lean();

        if (!projectPurchase) {
            return res.status(200).json({
                success: true,
                materialAvailable: false,
                message: 'No purchase request found for this project',
                materials: []
            });
        }

        const allAvailable = projectPurchase.materials.every(m => m.stockStatus === 'Available');
        const anyNotAvailable = projectPurchase.materials.some(m => m.stockStatus === 'Not Available');
        const anyPending = projectPurchase.materials.some(m => m.stockStatus === 'Pending');

        res.status(200).json({
            success: true,
            materialAvailable: allAvailable,
            materialStatus: allAvailable ? 'All Available' : anyNotAvailable ? 'Not Available' : anyPending ? 'Check Pending' : 'Partial',
            status: projectPurchase.status,
            paymentTermsMatch: projectPurchase.accountVerification.paymentTermsMatch,
            advancePaymentReceived: projectPurchase.accountVerification.advancePaymentReceived,
            invoiceGenerated: projectPurchase.accountVerification.invoiceGenerated,
            materials: projectPurchase.materials,
            projectPurchaseId: projectPurchase._id
        });
    } catch (error) {
        console.error('Error in getMaterialStatusByProject:', error);
        res.status(500).json({ error: 'Error fetching material status: ' + error.message });
    }
};

// ─── Update Project Purchase (General) ──────────────────────────────
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { materials, remark, status } = req.body;

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        const oldData = projectPurchase.toObject();

        if (materials && Array.isArray(materials)) {
            projectPurchase.materials = materials.map(m => ({
                productName: m.productName,
                description: m.description || '',
                quantity: Number(m.quantity),
                unit: m.unit || 'Nos',
                estimatedPrice: Number(m.estimatedPrice) || 0,
                stockStatus: m.stockStatus || 'Pending',
                availableQuantity: Number(m.availableQuantity) || 0,
                stockCheckedBy: m.stockCheckedBy,
                stockCheckedDate: m.stockCheckedDate,
                stockRemark: m.stockRemark || '',
                purchaseRequired: m.purchaseRequired || false,
                purchaseStatus: m.purchaseStatus || 'Not Required',
                vendorId: m.vendorId,
                purchaseOrderRef: m.purchaseOrderRef,
                purchaseDate: m.purchaseDate,
                expectedDeliveryDate: m.expectedDeliveryDate,
                actualDeliveryDate: m.actualDeliveryDate,
                purchaseRemark: m.purchaseRemark || ''
            }));
        }

        if (remark !== undefined) {
            projectPurchase.remark = remark;
        }
        if (status !== undefined) {
            projectPurchase.status = status;
        }

        const updated = await projectPurchase.save();
        await logUpdate(oldData, updated.toObject(), user, req, 'ProjectPurchase');

        res.status(200).json({
            success: true,
            message: 'Purchase request updated successfully',
            projectPurchase: updated
        });
    } catch (error) {
        console.error('Error in projectPurchase update:', error);
        res.status(500).json({ error: 'Error updating purchase request: ' + error.message });
    }
};

// ─── Delete Project Purchase ────────────────────────────────────────
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        await ProjectPurchase.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Purchase request deleted successfully'
        });
    } catch (error) {
        console.error('Error in projectPurchase delete:', error);
        res.status(500).json({ error: 'Error deleting purchase request: ' + error.message });
    }
};

// ─── Get Dashboard Stats ────────────────────────────────────────────
exports.getStats = async (req, res) => {
    try {
        const user = req.user;
        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));

        const stats = await ProjectPurchase.aggregate([
            { $match: { company: companyId } },
            {
                $group: {
                    _id: null,
                    totalRequests: { $sum: 1 },
                    storeCheckPending: {
                        $sum: { $cond: [{ $eq: ['$status', 'Store Check Pending'] }, 1, 0] }
                    },
                    purchasePending: {
                        $sum: { $cond: [{ $in: ['$status', ['Purchase Pending', 'Purchase Ordered']] }, 1, 0] }
                    },
                    readyForInvoice: {
                        $sum: { $cond: [{ $in: ['$status', ['Store Verified - Available', 'Ready for Invoice']] }, 1, 0] }
                    },
                    invoiceGenerated: {
                        $sum: { $cond: [{ $in: ['$status', ['Invoice Generated', 'Completed']] }, 1, 0] }
                    },
                    paymentMatched: {
                        $sum: { $cond: [{ $eq: ['$accountVerification.paymentTermsMatch', 'Matched'] }, 1, 0] }
                    },
                    paymentNotMatched: {
                        $sum: { $cond: [{ $eq: ['$accountVerification.paymentTermsMatch', 'Not Matched'] }, 1, 0] }
                    }
                }
            }
        ]);

        // ─── NEW: Count projects without purchase request ───────────
        const totalProjects = await Project.countDocuments({ company: companyId });
        const projectsWithPurchase = await ProjectPurchase.distinct('projectId', { company: companyId });
        const pendingProjectPurchaseCount = Math.max(0, totalProjects - projectsWithPurchase.length);

        res.status(200).json({
            success: true,
            stats: {
                ...(stats[0] || {
                    totalRequests: 0,
                    storeCheckPending: 0,
                    purchasePending: 0,
                    readyForInvoice: 0,
                    invoiceGenerated: 0,
                    paymentMatched: 0,
                    paymentNotMatched: 0
                }),
                pendingProjectPurchaseCount // Add the new count
            }
        });
    } catch (error) {
        console.error('Error in getStats:', error);
        res.status(500).json({ error: 'Error fetching stats: ' + error.message });
    }
};

// ─── Add More Materials to Existing Request ─────────────────────────
exports.addMaterials = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { materials } = req.body;

        if (!materials || !Array.isArray(materials) || materials.length === 0) {
            return res.status(400).json({ success: false, error: 'Materials are required' });
        }

        const projectPurchase = await ProjectPurchase.findById(id);
        if (!projectPurchase) {
            return res.status(404).json({ success: false, error: 'Purchase request not found' });
        }

        const newMaterials = materials.map(m => ({
            productName: m.productName,
            description: m.description || '',
            quantity: Number(m.quantity),
            unit: m.unit || 'Nos',
            estimatedPrice: Number(m.estimatedPrice) || 0,
            stockStatus: 'Pending',
            availableQuantity: 0,
            purchaseRequired: false,
            purchaseStatus: 'Not Required'
        }));

        projectPurchase.materials.push(...newMaterials);

        if (projectPurchase.status !== 'Completed' && projectPurchase.status !== 'Invoice Generated') {
            projectPurchase.status = 'Store Check Pending';
        }

        const updated = await projectPurchase.save();

        res.status(200).json({
            success: true,
            message: 'Materials added successfully',
            projectPurchase: updated
        });
    } catch (error) {
        console.error('Error in addMaterials:', error);
        res.status(500).json({ error: 'Error adding materials: ' + error.message });
    }
};