const AccountMaster = require('../models/accountMasterModel');
const Project = require('../models/projectModel');
const DeliveryChallan = require('../models/deliveryChallanModel');
const GRN = require('../models/grnModel');
const TaskSheet = require('../models/taskSheetModel');
const { bucket } = require('../utils/firebase');
const { logCreation, logUpdate } = require('../helpers/activityLogHelper');
const mongoose = require('mongoose');

// Get all accounts with filters
exports.getAllAccounts = async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const { invoiceStatus, search, followUpDue } = req.query;

        const isCompany = user.company ? false : true;
        const companyId = new mongoose.Types.ObjectId(isCompany ? user._id : user.company);
        let query = { company: companyId };

        // Filter by invoice status
        if (invoiceStatus && ['Pending', 'Partial', 'Paid', 'Overdue'].includes(invoiceStatus)) {
            query['accountActions.invoiceStatus'] = invoiceStatus;
        }

        // Filter by follow-up due today or overdue
        if (followUpDue === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            query['accountActions.nextFollowUpDate'] = { $gte: today, $lt: tomorrow };
        } else if (followUpDue === 'overdue') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query['accountActions.nextFollowUpDate'] = { $lt: today };
            query['accountActions.invoiceStatus'] = { $ne: 'Paid' };
        }

        // Search by customer name, project name, or PO number
        if (search && search.trim() !== '') {
            query.$or = [
                { customerName: { $regex: search.trim(), $options: 'i' } },
                { projectName: { $regex: search.trim(), $options: 'i' } },
                { poNumber: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const accounts = await AccountMaster.find(query)
            .skip(skip)
            .limit(limit)
            .populate('projectId', 'name projectStatus completeLevel')
            .populate('createdBy', 'name')
            .sort({ 'accountActions.nextFollowUpDate': 1, createdAt: -1 })
            .lean();

        const totalRecords = await AccountMaster.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limit);

        res.status(200).json({
            success: true,
            accounts,
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
        console.error('Error in getAllAccounts:', error);
        res.status(500).json({ error: 'Error fetching accounts: ' + error.message });
    }
};

// Get single account by project ID
exports.getAccountByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const user = req.user;

        const isCompany = user.company ? false : true;
        const companyId = new mongoose.Types.ObjectId(isCompany ? user._id : user.company);
        const query = { projectId, company: companyId };

        let account = await AccountMaster.findOne(query)
            .populate('projectId', 'name projectStatus completeLevel')
            .populate('createdBy', 'name')
            .lean();

        if (!account) {
            account = await exports.createAccountFromProject(projectId, user);
            if (!account) {
                return res.status(404).json({ success: false, error: 'Account not found' });
            }
        }

        res.status(200).json({ success: true, account });
    } catch (error) {
        console.error('Error in getAccountByProject:', error);
        res.status(500).json({ error: 'Error fetching account: ' + error.message });
    }
};

// Auto-create account from project
exports.createAccountFromProject = async (projectId, user) => {
    try {
        const project = await Project.findById(projectId)
            .populate('custId', 'custName')
            .lean();

        if (!project) return null;

        const existingAccount = await AccountMaster.findOne({ projectId });
        if (existingAccount) return existingAccount;

        const deliveryStatus = {
            materialDeliveredPercentage: 0,
            pendingMaterial: 'N/A',
            deliveryCompletedDate: null
        };

        const installationStatus = {
            workCompletedPercentage: project.completeLevel || 0,
            pendingWork: project.completeLevel >= 100 ? 'None' : 'In Progress',
            installationStatus: project.completeLevel >= 100 ? 'Completed' :
                project.completeLevel > 0 ? 'In Progress' : 'Not Started'
        };

        const isCompany = user.company ? false : true;

        const accountData = {
            projectId: project._id,
            company: isCompany ? user._id : user.company,
            customerName: project.custId?.custName || 'N/A',
            projectName: project.name,
            poNumber: project.purchaseOrderNo,
            product: project.category,
            paymentTerms: {
                advancePay: project.advancePay || 0,
                payAgainstDelivery: project.payAgainstDelivery || 0,
                payAfterCompletion: project.payAfterCompletion || 0,
                retention: project.retention || 0
            },
            basicAmount: project.purchaseOrderValue,
            deliveryStatus,
            installationStatus,
            createdBy: user._id
        };

        const account = await AccountMaster.create(accountData);
        await logCreation(account, user, { params: { projectId } }, 'AccountMaster');

        return account;
    } catch (error) {
        console.error('Error in createAccountFromProject:', error);
        return null;
    }
};

// Update account actions
exports.updateAccountActions = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const updateData = req.body;

        const account = await AccountMaster.findById(id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const oldData = { ...account.accountActions.toObject() };

        // Calculate total and pending amounts
        if (updateData.taxAmount !== undefined || updateData.receivedAmount !== undefined) {
            const taxAmount = updateData.taxAmount !== undefined
                ? Number(updateData.taxAmount)
                : account.accountActions.taxAmount;
            const receivedAmount = updateData.receivedAmount !== undefined
                ? Number(updateData.receivedAmount)
                : account.accountActions.receivedAmount;

            const totalInvoiceAmount = account.basicAmount + taxAmount;
            const pendingAmount = totalInvoiceAmount - receivedAmount;

            updateData.totalInvoiceAmount = totalInvoiceAmount;
            updateData.pendingAmount = Math.max(0, pendingAmount);

            // Auto-update invoice status
            if (pendingAmount <= 0) {
                updateData.invoiceStatus = 'Paid';
            } else if (receivedAmount > 0) {
                updateData.invoiceStatus = 'Partial';
            }
        }

        // Handle invoice PDF upload
        if (updateData.invoicePdf && typeof updateData.invoicePdf === 'string') {
            try {
                let base64String = updateData.invoicePdf.trim();
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
                const buffer = Buffer.from(base64String, 'base64');
                if (buffer.length > 5 * 1024 * 1024) {
                    return res.status(400).json({ success: false, error: 'Invoice PDF must be less than 5MB' });
                }
                const fileName = `Invoices/Invoice_${id}_${Date.now()}.pdf`;
                const file = bucket.file(fileName);
                await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
                await file.makePublic();
                updateData.invoicePdf = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            } catch (error) {
                console.error('Error uploading invoice PDF:', error);
                return res.status(400).json({ success: false, error: 'Failed to upload invoice PDF' });
            }
        }

        const updatedAccount = await AccountMaster.findByIdAndUpdate(
            id,
            { $set: { accountActions: { ...account.accountActions.toObject(), ...updateData } } },
            { new: true, runValidators: true }
        );

        await logUpdate(
            { accountActions: oldData },
            { accountActions: updatedAccount.accountActions },
            user, req, 'AccountMaster'
        );

        res.status(200).json({
            success: true,
            message: 'Account updated successfully',
            account: updatedAccount
        });
    } catch (error) {
        console.error('Error in updateAccountActions:', error);
        res.status(500).json({ error: 'Error updating account: ' + error.message });
    }
};

// Convert to Invoice
exports.convertToInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { invoiceNumber, invoiceDate, taxAmount, invoicePdf } = req.body;

        const account = await AccountMaster.findById(id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const totalInvoiceAmount = account.basicAmount + Number(taxAmount);
        const pendingAmount = totalInvoiceAmount - account.accountActions.receivedAmount;
        const invoiceStatus = pendingAmount <= 0 ? 'Paid' : 'Pending';

        // Handle invoice PDF upload
        let invoicePdfUrl = null;
        if (invoicePdf) {
            try {
                let base64String = invoicePdf.trim();
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
                const buffer = Buffer.from(base64String, 'base64');
                if (buffer.length > 5 * 1024 * 1024) {
                    return res.status(400).json({ success: false, error: 'Invoice PDF must be less than 5MB' });
                }
                const fileName = `Invoices/Invoice_${invoiceNumber}_${Date.now()}.pdf`;
                const file = bucket.file(fileName);
                await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
                await file.makePublic();
                invoicePdfUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            } catch (error) {
                console.error('Error uploading invoice PDF:', error);
                return res.status(400).json({ success: false, error: 'Failed to upload invoice PDF' });
            }
        }

        const invoiceEntry = {
            invoiceNumber,
            invoiceDate: new Date(invoiceDate),
            invoiceAmount: account.basicAmount,
            taxAmount: Number(taxAmount),
            totalAmount: totalInvoiceAmount,
            invoicePdf: invoicePdfUrl,
            status: invoiceStatus,
            createdAt: new Date()
        };

        const updatedAccount = await AccountMaster.findByIdAndUpdate(
            id,
            {
                $set: {
                    'accountActions.invoiceNumber': invoiceNumber,
                    'accountActions.invoiceDate': new Date(invoiceDate),
                    'accountActions.taxAmount': Number(taxAmount),
                    'accountActions.totalInvoiceAmount': totalInvoiceAmount,
                    'accountActions.pendingAmount': Math.max(0, pendingAmount),
                    'accountActions.invoicePdf': invoicePdfUrl,
                    'accountActions.invoiceStatus': invoiceStatus
                },
                $push: { invoiceHistory: invoiceEntry }
            },
            { new: true }
        );

        await logUpdate(
            { accountActions: account.accountActions },
            { accountActions: updatedAccount.accountActions },
            user, req, 'AccountMaster'
        );

        res.status(200).json({
            success: true,
            message: 'Invoice created successfully',
            account: updatedAccount
        });
    } catch (error) {
        console.error('Error in convertToInvoice:', error);
        res.status(500).json({ error: 'Error creating invoice: ' + error.message });
    }
};

// Add follow-up
exports.addFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { followUpDate, nextFollowUpDate, remark, contactPerson } = req.body;

        const account = await AccountMaster.findById(id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const followUpEntry = {
            followUpDate: new Date(followUpDate),
            nextFollowUpDate: new Date(nextFollowUpDate),
            remark,
            contactPerson,
            createdAt: new Date()
        };

        const updatedAccount = await AccountMaster.findByIdAndUpdate(
            id,
            {
                $push: { followUpHistory: followUpEntry },
                $set: {
                    'accountActions.nextFollowUpDate': new Date(nextFollowUpDate),
                    'accountActions.lastFollowUpDate': new Date(followUpDate)
                }
            },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Follow-up added successfully',
            account: updatedAccount
        });
    } catch (error) {
        console.error('Error in addFollowUp:', error);
        res.status(500).json({ error: 'Error adding follow-up: ' + error.message });
    }
};

// Get follow-up alerts (due today or overdue)
exports.getFollowUpAlerts = async (req, res) => {
    try {
        const user = req.user;
        const isCompany = user.company ? false : true;
        const companyId = new mongoose.Types.ObjectId(isCompany ? user._id : user.company);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const alerts = await AccountMaster.find({
            company: companyId,
            'accountActions.nextFollowUpDate': { $lt: tomorrow },
            'accountActions.invoiceStatus': { $ne: 'Paid' }
        })
            .populate('projectId', 'name')
            .sort({ 'accountActions.nextFollowUpDate': 1 })
            .lean();

        const todayAlerts = alerts.filter(a => {
            const d = new Date(a.accountActions.nextFollowUpDate);
            return d >= today && d < tomorrow;
        });

        const overdueAlerts = alerts.filter(a => {
            const d = new Date(a.accountActions.nextFollowUpDate);
            return d < today;
        });

        res.status(200).json({
            success: true,
            todayAlerts,
            overdueAlerts,
            totalAlerts: alerts.length
        });
    } catch (error) {
        console.error('Error in getFollowUpAlerts:', error);
        res.status(500).json({ error: 'Error fetching follow-up alerts: ' + error.message });
    }
};

// Sync account data with project
exports.syncWithProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        const account = await AccountMaster.findOne({ projectId });
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const project = await Project.findById(projectId)
            .populate('custId', 'custName')
            .lean();

        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }

        const updateData = {
            customerName: project.custId?.custName || account.customerName,
            projectName: project.name,
            poNumber: project.purchaseOrderNo,
            product: project.category,
            paymentTerms: {
                advancePay: project.advancePay || 0,
                payAgainstDelivery: project.payAgainstDelivery || 0,
                payAfterCompletion: project.payAfterCompletion || 0,
                retention: project.retention || 0
            },
            basicAmount: project.purchaseOrderValue,
            installationStatus: {
                ...account.installationStatus,
                workCompletedPercentage: project.completeLevel || 0,
                installationStatus: project.completeLevel >= 100 ? 'Completed' :
                    project.completeLevel > 0 ? 'In Progress' : 'Not Started'
            }
        };

        const updatedAccount = await AccountMaster.findByIdAndUpdate(
            account._id,
            { $set: updateData },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Account synced with project successfully',
            account: updatedAccount
        });
    } catch (error) {
        console.error('Error in syncWithProject:', error);
        res.status(500).json({ error: 'Error syncing account: ' + error.message });
    }
};

// Get account statistics
exports.getAccountStats = async (req, res) => {
    try {
        const user = req.user;
        const isCompany = user.company ? false : true;
        const companyId = new mongoose.Types.ObjectId(isCompany ? user._id : user.company);

        const stats = await AccountMaster.aggregate([
            { $match: { company: companyId } },
            {
                $group: {
                    _id: null,
                    totalAccounts: { $sum: 1 },
                    totalBasicAmount: { $sum: '$basicAmount' },
                    totalReceivedAmount: { $sum: '$accountActions.receivedAmount' },
                    totalPendingAmount: { $sum: '$accountActions.pendingAmount' },
                    totalTaxAmount: { $sum: '$accountActions.taxAmount' },
                    paidCount: { $sum: { $cond: [{ $eq: ['$accountActions.invoiceStatus', 'Paid'] }, 1, 0] } },
                    pendingCount: { $sum: { $cond: [{ $eq: ['$accountActions.invoiceStatus', 'Pending'] }, 1, 0] } },
                    partialCount: { $sum: { $cond: [{ $eq: ['$accountActions.invoiceStatus', 'Partial'] }, 1, 0] } },
                    overdueCount: { $sum: { $cond: [{ $eq: ['$accountActions.invoiceStatus', 'Overdue'] }, 1, 0] } }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            stats: stats[0] || {
                totalAccounts: 0,
                totalBasicAmount: 0,
                totalReceivedAmount: 0,
                totalPendingAmount: 0,
                totalTaxAmount: 0,
                paidCount: 0,
                pendingCount: 0,
                partialCount: 0,
                overdueCount: 0
            }
        });
    } catch (error) {
        console.error('Error in getAccountStats:', error);
        res.status(500).json({ error: 'Error fetching account stats: ' + error.message });
    }
};

// Bulk sync all projects into Account Master
exports.bulkSyncAllProjects = async (req, res) => {
    try {
        const user = req.user;
        const isCompany = user.company ? false : true;
        const companyId = isCompany ? user._id : user.company;

        const projects = await Project.find({ company: companyId })
            .populate('custId', 'custName')
            .lean();

        let created = 0;
        let skipped = 0;
        const errors = [];

        for (const project of projects) {
            try {
                const exists = await AccountMaster.findOne({ projectId: project._id });
                if (exists) { skipped++; continue; }

                if (!project.purchaseOrderValue || project.purchaseOrderValue <= 0) {
                    skipped++;
                    continue;
                }

                await AccountMaster.create({
                    projectId: project._id,
                    company: companyId,
                    customerName: project.custId?.custName || 'N/A',
                    projectName: project.name || 'N/A',
                    poNumber: project.purchaseOrderNo || 'N/A',
                    product: project.category || 'N/A',
                    paymentTerms: {
                        advancePay: project.advancePay || 0,
                        payAgainstDelivery: project.payAgainstDelivery || 0,
                        payAfterCompletion: project.payAfterCompletion || 0,
                        retention: project.retention || 0
                    },
                    basicAmount: project.purchaseOrderValue,
                    deliveryStatus: {
                        materialDeliveredPercentage: 0,
                        pendingMaterial: 'N/A'
                    },
                    installationStatus: {
                        workCompletedPercentage: project.completeLevel || 0,
                        pendingWork: project.completeLevel >= 100 ? 'None' : 'Pending',
                        installationStatus: project.completeLevel >= 100 ? 'Completed' :
                            project.completeLevel > 0 ? 'In Progress' : 'Not Started'
                    },
                    createdBy: user._id
                });
                created++;
            } catch (err) {
                errors.push({ project: project.name, error: err.message });
                skipped++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Sync complete. Created: ${created}, Skipped: ${skipped}`,
            created,
            skipped,
            errors
        });
    } catch (error) {
        console.error('Error in bulkSyncAllProjects:', error);
        res.status(500).json({ error: 'Bulk sync failed: ' + error.message });
    }
};