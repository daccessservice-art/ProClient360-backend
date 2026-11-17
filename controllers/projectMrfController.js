const mongoose = require('mongoose');
const ProjectMRF = require('../models/projectMrfModel');
const { RESPONSIBILITY } = require('../models/projectMrfModel');
const Product = require('../models/productModel');
const Project = require('../models/projectModel');
const Designation = require('../models/designationModel');

// Keep Inventory Master stock history in sync (same hook productController uses)
let inventorySync = null;
try { inventorySync = require('./inventoryController'); } catch (e) { inventorySync = null; }

// ─── Who can use Project MRF ─────────────────────────────────────────────────
// Company login → always. Employees → if their designation has ANY of these.
// Sales usually have createProject/updateProject, store usually has
// viewProduct/viewInventory. Add or remove names here to match your designations.
const MRF_ACCESS_PERMISSIONS = [
    'createMRF', 'viewMRF', 'updateMRF',
    'createProject', 'updateProject', 'viewProject',
    'viewProduct', 'viewInventory',
];

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));
const companyIdOf = (user) => (user.company ? user.company : user._id);
const userNameOf = (user) => user?.name || user?.email || 'User';
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.requireMRFAccess = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ success: false, error: 'Please login again' });
        if (!user.company) return next(); // company account

        const designation = await Designation.findById(user.designation).lean();
        const perms = Array.isArray(designation?.permissions) ? designation.permissions : [];
        if (perms.some((p) => MRF_ACCESS_PERMISSIONS.includes(p))) return next();

        return res.status(403).json({ success: false, error: "You don't have permission to access MRF" });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'MRF permission check failed: ' + error.message });
    }
};

// ─── Stock helpers ───────────────────────────────────────────────────────────
const syncInventory = async (oldProduct, newProduct, user) => {
    if (!inventorySync?.onProductUpdated) return;
    try {
        await inventorySync.onProductUpdated(oldProduct, newProduct, user);
    } catch (e) {
        console.error('[ProjectMRF] inventory sync failed:', e.message);
    }
};

// Deduct `qty` from a product. Compare-and-set so two MRFs saved at the same
// moment can never push stock below 0. Returns { prod, stock, issued }.
const deductFromProduct = async (productId, companyId, requiredQty, user) => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const prod = await Product.findOne({ _id: productId, company: companyId }).lean();
        if (!prod) return null;

        const stock = Math.max(0, Number(prod.currentStockQty) || 0);
        const issued = Math.min(stock, requiredQty);
        if (issued === 0) return { prod, stock, issued: 0 };

        const updated = await Product.findOneAndUpdate(
            { _id: prod._id, currentStockQty: prod.currentStockQty },
            { $inc: { currentStockQty: -issued } },
            { new: true }
        ).lean();

        if (updated) {
            await syncInventory(prod, updated, user);
            return { prod, stock, issued };
        }
        // stock changed between read and write → read again
    }
    throw new Error('Stock is being updated by someone else, please try again');
};

// Turn request items into saved items, deducting stock where possible.
const issueStock = async (rawItems, companyId, user) => {
    const items = [];
    try {
        for (let i = 0; i < rawItems.length; i++) {
            const r = rawItems[i];
            const requiredQty = Math.floor(Number(r.requiredQty) || 0);
            const item = {
                srNo: i + 1,
                product: null,
                productName: str(r.productName, 200),
                brandName: str(r.brandName, 100),
                modelNo: str(r.modelNo, 100),
                materialDescription: str(r.materialDescription, 2000),
                unit: str(r.unit, 50) || 'No.',
                rate: Math.max(0, Number(r.rate) || 0),
                remark: str(r.remark, 1000),
                requiredQty,
                stockAtRequest: 0,
                issuedQty: 0,
                shortageQty: requiredQty,
                availabilityStatus: 'Not in Product Master',
            };

            if (r.productId && isValidId(r.productId)) {
                const result = await deductFromProduct(r.productId, companyId, requiredQty, user);
                if (result) {
                    const { prod, stock, issued } = result;
                    item.product = prod._id;
                    item.productName = item.productName || prod.productName || '';
                    item.brandName = item.brandName || prod.brandName || '';
                    item.modelNo = item.modelNo || prod.model || '';
                    item.stockAtRequest = stock;
                    item.issuedQty = issued;
                    item.shortageQty = requiredQty - issued;
                    item.availabilityStatus =
                        issued >= requiredQty ? 'Available' : issued > 0 ? 'Partial' : 'Not Available';
                }
            }
            items.push(item);
        }
        return items;
    } catch (error) {
        // put back whatever was already deducted in this call
        await restoreStock(items, user);
        throw error;
    }
};

// Return issuedQty of each item back to Product Master.
const restoreStock = async (items, user) => {
    for (const it of items || []) {
        const qty = Number(it.issuedQty) || 0;
        if (!it.product || qty <= 0) continue;
        try {
            const before = await Product.findOneAndUpdate(
                { _id: it.product },
                { $inc: { currentStockQty: qty } },
                { new: false }
            ).lean();
            if (before) {
                const after = { ...before, currentStockQty: (Number(before.currentStockQty) || 0) + qty };
                await syncInventory(before, after, user);
            }
        } catch (e) {
            console.error('[ProjectMRF] stock restore failed for', String(it.product), e.message);
        }
    }
};

const summarize = (items) => {
    const short = items.filter((i) => i.shortageQty > 0).length;
    const anyIssued = items.some((i) => i.issuedQty > 0);
    return {
        shortageItemCount: short,
        materialStatus: short === 0 ? 'All Available' : anyIssued ? 'Partial' : 'Not Available',
    };
};

const cleanContact = (c = {}) => ({
    name: str(c.name, 100),
    contact: str(c.contact, 20),
    email: str(c.email, 150).toLowerCase(),
});
const cleanResp = (v) => (RESPONSIBILITY.includes(v) ? v : '');

// Validate the body and return { header, rawItems } or { error }
const readBody = (b) => {
    const mrfNo = str(b.mrfNo, 50);
    if (!mrfNo) return { error: 'MRF No is required' };

    const mrfDate = b.mrfDate ? new Date(b.mrfDate) : new Date();
    if (isNaN(mrfDate.getTime())) return { error: 'Invalid MRF date' };

    const rawItems = (Array.isArray(b.items) ? b.items : []).filter(
        (r) => str(r.productName) || str(r.materialDescription)
    );
    if (rawItems.length === 0) return { error: 'Add at least one material item' };
    if (rawItems.some((r) => !(Math.floor(Number(r.requiredQty)) >= 1)))
        return { error: 'Quantity must be at least 1 for every item' };

    const contacts = b.contacts || {};
    const scope = b.scopeOfWorks || {};
    return {
        rawItems,
        header: {
            mrfNo,
            mrfDate,
            nameOfSite: str(b.nameOfSite, 200),
            supplyType: b.supplyType === 'Supply' ? 'Supply' : 'Project',
            billingAddress: str(b.billingAddress, 1000),
            contacts: {
                store: cleanContact(contacts.store),
                project: cleanContact(contacts.project),
                accounts: cleanContact(contacts.accounts),
            },
            momDescription: str(b.momDescription, 2000),
            scopeItems: (Array.isArray(b.scopeItems) ? b.scopeItems : [])
                .slice(0, 60)
                .map((r) => ({
                    item: str(r?.item, 200),
                    yourself: str(r?.yourself, 200),
                    customer: str(r?.customer, 200),
                }))
                .filter((r) => r.item),
            scopeOfWorks: {
                cablingWarranty: cleanResp(scope.cablingWarranty),
                civilWarranty: cleanResp(scope.civilWarranty),
                chimbyPicksLadder: cleanResp(scope.chimbyPicksLadder),
                fabricationWarranty: cleanResp(scope.fabricationWarranty),
            },
        },
    };
};

// ─── Product search for the MRF popup (no viewProduct permission needed) ─────
exports.searchProducts = async (req, res) => {
    try {
        const companyId = companyIdOf(req.user);
        const q = str(req.query.q, 100);
        if (!q) return res.status(200).json({ success: true, products: [] });

        const rx = new RegExp(escapeRegex(q), 'i');
        const products = await Product.find({
            company: companyId,
            $or: [{ productName: rx }, { brandName: rx }, { model: rx }, { printName: rx }, { hsnCode: rx }],
        })
            .select('productName brandName model description hsnCode baseUOM salesPrice currentStockQty')
            .sort({ productName: 1 })
            .limit(30)
            .lean();

        res.status(200).json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error searching products: ' + error.message });
    }
};

// ─── MRF history for one project ─────────────────────────────────────────────
exports.listByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidId(projectId)) return res.status(400).json({ success: false, error: 'Invalid project' });

        const mrfs = await ProjectMRF.find({ company: companyIdOf(req.user), project: projectId })
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, mrfs });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching MRF history: ' + error.message });
    }
};

// ─── All MRFs (for a store-side list page) ───────────────────────────────────
exports.listAll = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const query = { company: companyIdOf(req.user) };
        if (['Saved', 'Sent'].includes(req.query.status)) query.status = req.query.status;
        if (['All Available', 'Partial', 'Not Available'].includes(req.query.materialStatus))
            query.materialStatus = req.query.materialStatus;
        const search = str(req.query.search, 100);
        if (search) query.mrfNo = new RegExp(escapeRegex(search), 'i');

        const [mrfs, total] = await Promise.all([
            ProjectMRF.find(query)
                .populate('project', 'name purchaseOrderNo')
                .populate('customer', 'custName')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ProjectMRF.countDocuments(query),
        ]);
        const totalPages = Math.ceil(total / limit);
        res.status(200).json({
            success: true,
            mrfs,
            pagination: { currentPage: page, totalPages, total, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching MRFs: ' + error.message });
    }
};

// ─── One MRF, with each item's CURRENT stock from Product Master ─────────────
exports.getOne = async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid MRF id' });
        const mrf = await ProjectMRF.findOne({ _id: req.params.id, company: companyIdOf(req.user) })
            .populate('project', 'name purchaseOrderNo')
            .populate('customer', 'custName')
            .lean();
        if (!mrf) return res.status(404).json({ success: false, error: 'MRF not found' });

        const ids = mrf.items.filter((i) => i.product).map((i) => i.product);
        const prods = await Product.find({ _id: { $in: ids } }).select('currentStockQty').lean();
        const stockMap = new Map(prods.map((p) => [String(p._id), Number(p.currentStockQty) || 0]));
        mrf.items = mrf.items.map((i) => ({
            ...i,
            currentStock: i.product ? stockMap.get(String(i.product)) ?? 0 : null,
        }));

        res.status(200).json({ success: true, mrf });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching MRF: ' + error.message });
    }
};

// ─── Create ──────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
    const user = req.user;
    const companyId = companyIdOf(user);
    let items = null;
    try {
        const b = req.body || {};
        if (!isValidId(b.project)) return res.status(400).json({ success: false, error: 'Project is required' });

        const project = await Project.findOne({ _id: b.project, company: companyId }).lean();
        if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

        const { error, header, rawItems } = readBody(b);
        if (error) return res.status(400).json({ success: false, error });

        if (await ProjectMRF.exists({ company: companyId, mrfNo: header.mrfNo }))
            return res.status(409).json({ success: false, error: `MRF No "${header.mrfNo}" already exists` });

        items = await issueStock(rawItems, companyId, user);

        const mrf = await ProjectMRF.create({
            ...header,
            company: companyId,
            project: project._id,
            customer: project.custId,
            customerPONo: project.purchaseOrderNo || '',
            items,
            ...summarize(items),
            status: 'Saved',
            createdBy: user._id,
            createdByName: userNameOf(user),
            history: [{ action: 'Created', by: user._id, byName: userNameOf(user) }],
        });

        const issuedCount = items.filter((i) => i.issuedQty > 0).length;
        res.status(201).json({
            success: true,
            message: `MRF ${mrf.mrfNo} saved. Stock deducted for ${issuedCount} item(s)` +
                (mrf.shortageItemCount ? `, ${mrf.shortageItemCount} item(s) short.` : '.'),
            mrf,
        });
    } catch (error) {
        if (items) await restoreStock(items, user); // MRF not saved → give stock back
        if (error.code === 11000)
            return res.status(409).json({ success: false, error: 'This MRF No already exists' });
        if (error.name === 'ValidationError')
            return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Error saving MRF: ' + error.message });
    }
};

// ─── Update (old stock returned, new stock issued) ───────────────────────────
exports.update = async (req, res) => {
    const user = req.user;
    const companyId = companyIdOf(user);
    let oldRestored = false;
    let newItems = null;
    let oldItems = [];
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid MRF id' });
        const existing = await ProjectMRF.findOne({ _id: req.params.id, company: companyId });
        if (!existing) return res.status(404).json({ success: false, error: 'MRF not found' });
        oldItems = existing.items.map((i) => ({ product: i.product, issuedQty: i.issuedQty }));

        const { error, header, rawItems } = readBody(req.body || {});
        if (error) return res.status(400).json({ success: false, error });

        if (await ProjectMRF.exists({ company: companyId, mrfNo: header.mrfNo, _id: { $ne: existing._id } }))
            return res.status(409).json({ success: false, error: `MRF No "${header.mrfNo}" already exists` });

        await restoreStock(oldItems, user);
        oldRestored = true;
        newItems = await issueStock(rawItems, companyId, user);

        Object.assign(existing, header, { items: newItems }, summarize(newItems));
        existing.updatedByName = userNameOf(user);
        existing.history.push({ action: 'Updated', by: user._id, byName: userNameOf(user) });
        await existing.save();

        res.status(200).json({ success: true, message: `MRF ${existing.mrfNo} updated`, mrf: existing });
    } catch (error) {
        // roll back: return new deductions, take old deductions again
        if (newItems) await restoreStock(newItems, user);
        if (oldRestored) {
            for (const it of oldItems) {
                if (it.product && it.issuedQty > 0) {
                    await Product.updateOne({ _id: it.product }, { $inc: { currentStockQty: -it.issuedQty } })
                        .catch((e) => console.error('[ProjectMRF] rollback failed:', e.message));
                }
            }
        }
        if (error.code === 11000) return res.status(409).json({ success: false, error: 'This MRF No already exists' });
        if (error.name === 'ValidationError') return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Error updating MRF: ' + error.message });
    }
};

// ─── Send to store (email to store comes in the next step) ───────────────────
exports.send = async (req, res) => {
    try {
        const user = req.user;
        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid MRF id' });
        const mrf = await ProjectMRF.findOne({ _id: req.params.id, company: companyIdOf(user) });
        if (!mrf) return res.status(404).json({ success: false, error: 'MRF not found' });

        mrf.status = 'Sent';
        mrf.sentAt = new Date();
        mrf.sentByName = userNameOf(user);
        mrf.history.push({ action: 'Sent to Store', by: user._id, byName: userNameOf(user) });
        await mrf.save();

        res.status(200).json({ success: true, message: `MRF ${mrf.mrfNo} sent to store`, mrf });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error sending MRF: ' + error.message });
    }
};

// ─── Delete (stock returned) — company or the person who created it ──────────
exports.remove = async (req, res) => {
    try {
        const user = req.user;
        if (!isValidId(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid MRF id' });
        const mrf = await ProjectMRF.findOne({ _id: req.params.id, company: companyIdOf(user) });
        if (!mrf) return res.status(404).json({ success: false, error: 'MRF not found' });

        const isOwner = mrf.createdBy && String(mrf.createdBy) === String(user._id);
        if (user.company && !isOwner)
            return res.status(403).json({ success: false, error: 'Only the creator or company admin can delete this MRF' });

        await restoreStock(mrf.items, user);
        await ProjectMRF.deleteOne({ _id: mrf._id });
        res.status(200).json({ success: true, message: `MRF ${mrf.mrfNo} deleted, stock returned to Product Master` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error deleting MRF: ' + error.message });
    }
};