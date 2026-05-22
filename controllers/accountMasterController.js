const AccountMaster = require('../models/accountMasterModel');
const Project = require('../models/projectModel');
const DeliveryChallan = require('../models/deliveryChallanModel');
const GRN = require('../models/grnModel');
const TaskSheet = require('../models/taskSheetModel');
const { bucket } = require('../utils/firebase');
const { logCreation, logUpdate } = require('../helpers/activityLogHelper');
const mongoose = require('mongoose');

// ─── Helper: Safely extract Company ID ─────────────────────────────────
const getCompanyId = (user) => {
    if (user.company) {
        return typeof user.company === 'object' ? user.company._id : user.company;
    }
    return user._id;
};

// ─── Helper: Upload Multiple PDFs ─────────────────────────────────────
const uploadMultiplePdfs = async (pdfsArray, folderName, invoiceNumber) => {
    const uploadedUrls = [];
    if (!pdfsArray || !Array.isArray(pdfsArray)) return uploadedUrls;

    for (let i = 0; i < pdfsArray.length; i++) {
        const pdfData = pdfsArray[i];
        if (pdfData && typeof pdfData === 'string' && pdfData.startsWith('data:')) {
            try {
                let base64String = pdfData.trim();
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
                if (!base64String || base64String.length < 100) continue;

                const buffer = Buffer.from(base64String, 'base64');
                if (buffer.length > 5 * 1024 * 1024) continue; // Skip files > 5MB

                const fileName = `${folderName}/${invoiceNumber || 'inv'}_${Date.now()}_${i}.pdf`;
                const file = bucket.file(fileName);
                await file.save(buffer, { metadata: { contentType: 'application/pdf' } });
                await file.makePublic();
                uploadedUrls.push(`https://storage.googleapis.com/${bucket.name}/${fileName}`);
            } catch (error) {
                console.error(`Error uploading PDF ${i}:`, error);
            }
        }
    }
    return uploadedUrls;
};

// Get all accounts with filters
exports.getAllAccounts = async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const { invoiceStatus, search, followUpDue } = req.query;

        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));
        let query = { company: companyId };

        if (invoiceStatus && ['Pending', 'Partial', 'Paid', 'Overdue'].includes(invoiceStatus)) {
            query['accountActions.invoiceStatus'] = invoiceStatus;
        }

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

        if (search && search.trim() !== '') {
            query.$or = [
                { customerName: { $regex: search.trim(), $options: 'i' } },
                { projectName:  { $regex: search.trim(), $options: 'i' } },
                { poNumber:     { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const accounts = await AccountMaster.find(query)
            .skip(skip)
            .limit(limit)
            .populate('projectId', 'name projectStatus completeLevel')
            .populate('createdBy', 'name')
            .sort({ updatedAt: -1, createdAt: -1 }) // ✅ FIXED: newest/recently-updated first
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

        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));
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

        const companyId = getCompanyId(user);

        const accountData = {
            projectId: project._id,
            company: companyId,
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

            if (pendingAmount <= 0) {
                updateData.invoiceStatus = 'Paid';
            } else if (receivedAmount > 0) {
                updateData.invoiceStatus = 'Partial';
            }
        }

        // Handle multiple invoice PDF uploads
        if (updateData.invoicePdfs && Array.isArray(updateData.invoicePdfs) && updateData.invoicePdfs.length > 0) {
            const newUrls = await uploadMultiplePdfs(updateData.invoicePdfs, 'Invoices', account.poNumber || 'account');
            if (newUrls.length > 0) {
                // Merge with existing PDFs
                updateData.invoicePdfs = [...(account.accountActions.invoicePdfs || []), ...newUrls];
            } else {
                delete updateData.invoicePdfs; // Don't update if nothing was uploaded
            }
        } else {
            delete updateData.invoicePdfs; // Remove empty array from update
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

// ─── Convert to Invoice (Multiple PDFs Support) ──────────────────
exports.convertToInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const { invoiceNumber, invoiceDate, taxAmount, invoicePdfs, invoiceAmount } = req.body;

        const account = await AccountMaster.findById(id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        if (!invoiceNumber || !invoiceNumber.trim()) {
            return res.status(400).json({ success: false, error: 'Invoice number is required' });
        }

        // Check for duplicate invoice number
        const duplicateInvoice = account.invoiceHistory.find(
            inv => inv.invoiceNumber === invoiceNumber.trim()
        );
        if (duplicateInvoice) {
            return res.status(400).json({ success: false, error: 'Invoice number already exists for this project' });
        }

        const invAmount = Number(invoiceAmount) || account.basicAmount;
        const invTax = Number(taxAmount) || 0;
        const totalAmount = invAmount + invTax;

        const previousInvoicedTotal = account.invoiceHistory.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
        const totalInvoiceAmount = previousInvoicedTotal + totalAmount;
        const pendingAmount = Math.max(0, totalInvoiceAmount - account.accountActions.receivedAmount);

        let invoiceStatus = 'Pending';
        if (pendingAmount <= 0) {
            invoiceStatus = 'Paid';
        } else if (account.accountActions.receivedAmount > 0) {
            invoiceStatus = 'Partial';
        }

        // Upload multiple PDFs
        const invoicePdfUrls = await uploadMultiplePdfs(invoicePdfs, 'Invoices', invoiceNumber);

        const invoiceEntry = {
            invoiceNumber: invoiceNumber.trim(),
            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            invoiceAmount: invAmount,
            taxAmount: invTax,
            totalAmount: totalAmount,
            invoicePdfs: invoicePdfUrls,
            status: invoiceStatus,
            createdAt: new Date()
        };

        const updatedAccount = await AccountMaster.findByIdAndUpdate(
            id,
            {
                $set: {
                    'accountActions.invoiceNumber': invoiceNumber.trim(),
                    'accountActions.invoiceDate': invoiceDate ? new Date(invoiceDate) : new Date(),
                    'accountActions.taxAmount': invTax,
                    'accountActions.totalInvoiceAmount': totalInvoiceAmount,
                    'accountActions.pendingAmount': pendingAmount,
                    'accountActions.invoiceStatus': invoiceStatus,
                    ...(invoicePdfUrls.length > 0 && { 'accountActions.invoicePdfs': invoicePdfUrls })
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
            message: `Invoice #${invoiceNumber} created with ${invoicePdfUrls.length} PDF(s). Total invoices: ${updatedAccount.invoiceHistory.length}`,
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

// Get follow-up alerts
exports.getFollowUpAlerts = async (req, res) => {
    try {
        const user = req.user;
        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));

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

// Sync account with project
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
        const companyId = new mongoose.Types.ObjectId(getCompanyId(user));

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
        const companyId = getCompanyId(user);

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