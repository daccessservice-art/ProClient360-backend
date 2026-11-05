const mongoose = require('mongoose');
const Inventory = require('../models/inventoryModel');
const Product = require('../models/productModel');
const { GRN } = require('../models/grnModel');
const DeliveryChallan = require('../models/deliveryChallanModel');

// ═════════════════════════════════════════════════════════════════════════════
// HOW STOCK IS CALCULATED (Inventory Master)
// ─────────────────────────────────────────────────────────────────────────────
//  Opening Stock : entered when the item was created (editable)
//  IN  (+)       : GRN received qty (GRN date on/after Opening Date) + Manual In
//  OUT (−)       : DC quantity      (DC date on/after Opening Date)  + Manual Out
//
//  Current Stock :
//   • Linked to a Product Master item that has Brand + Model
//       → Product Master "currentStockQty" (GRN adds / DC deducts it live)
//       → GRN / DC rows are matched ONLY by that Brand + Model, exactly the
//         same rule the GRN and DC controllers use, so the ledger matches.
//   • Otherwise → Opening + IN − OUT (matched by Brand+Model or Product Name)
//
//  Every ledger row shows WHO entered it (employee or company login) and WHEN.
// ═════════════════════════════════════════════════════════════════════════════

const norm = (v) => (v === undefined || v === null ? '' : String(v)).trim().toLowerCase();
const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const round = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isValidParam = (v) =>
  v !== undefined && v !== null && String(v).trim() !== '' &&
  !['null', 'undefined'].includes(String(v).trim().toLowerCase());

// req.user.company can be an ObjectId, a string, OR a populated company object.
const extractId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'object' && value._id) return extractId(value._id);
  const str = String(value);
  return /^[a-f0-9]{24}$/i.test(str) ? new mongoose.Types.ObjectId(str) : null;
};
const getCompanyId = (user) => extractId(user?.company) || extractId(user?._id);
const toObjectId = (id) => {
  const oid = extractId(id);
  if (!oid) throw new Error(`Invalid id: ${typeof id === 'object' ? JSON.stringify(id) : id}`);
  return oid;
};
const userDisplayName = (u) => u?.name || u?.companyName || u?.email || 'User';

const startOfDay = (d) => {
  const x = d ? new Date(d) : new Date(0);
  if (Number.isNaN(x.getTime())) return new Date(0);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  x.setHours(23, 59, 59, 999);
  return x;
};

// ── Name lookups straight from the collections (works for employee AND company logins) ──
const lookupNames = async (collection, ids, fields) => {
  const oids = [...new Set(ids.filter(Boolean).map((i) => String(extractId(i) || '')))]
    .filter(Boolean)
    .map((s) => new mongoose.Types.ObjectId(s));
  if (!oids.length) return new Map();
  const projection = fields.reduce((p, f) => ({ ...p, [f]: 1 }), {});
  try {
    const docs = await mongoose.connection.collection(collection)
      .find({ _id: { $in: oids } }, { projection }).toArray();
    return new Map(docs.map((d) => [String(d._id), fields.map((f) => d[f]).find(Boolean) || '']));
  } catch (e) {
    console.warn(`[Inventory] name lookup in "${collection}" failed:`, e.message);
    return new Map();
  }
};

const lookupUsers = async (ids) => {
  const [companies, employees] = await Promise.all([
    lookupNames('companies', ids, ['name', 'email']),
    lookupNames('employees', ids, ['name', 'email']),
  ]);
  return new Map([...companies, ...employees]);
};

// ── stock source rules ──────────────────────────────────────────────────────
const tracksStock = (product) => !!(product && norm(product.brandName) && norm(product.model));

const sourceKey = (brand, model, name) => {
  const b = norm(brand), m = norm(model), n = norm(name);
  if (b && m) return `bm:${b}|${m}`;
  if (n) return `nm:${n}`;
  return null;
};

const inventoryKeys = (inv, product) => {
  if (tracksStock(product)) {
    return product._primary === false ? [] : [`bm:${norm(product.brandName)}|${norm(product.model)}`];
  }
  const keys = new Set();
  const brand = inv.brandName || product?.brandName;
  const model = inv.model || product?.model;
  const name = inv.productName || product?.productName || inv.materialName;
  if (norm(brand) && norm(model)) keys.add(`bm:${norm(brand)}|${norm(model)}`);
  if (norm(name)) keys.add(`nm:${norm(name)}`);
  return [...keys];
};

const getStockStatus = (current, min) => {
  if (current <= 0) return 'Out of Stock';
  if (min > 0 && current <= min) return 'Low Stock';
  return 'In Stock';
};

// ── Products of the company ────────────────────────────────────────────────
const loadProductMaps = async (companyId) => {
  // oldest first — GRN / DC update the FIRST product with a Brand + Model, so the
  // oldest of any duplicates is the one that really receives the stock ("primary")
  const products = await Product.find({ company: companyId })
    .select('productName brandName model currentStockQty baseUOM purchasePrice hsnCode createdAt createdBy updatedAt')
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  const byId = new Map();
  const byBrandModel = new Map();
  products.forEach((p) => {
    byId.set(String(p._id), p);
    const b = norm(p.brandName), m = norm(p.model);
    if (b && m) {
      if (!byBrandModel.has(`${b}|${m}`)) {
        byBrandModel.set(`${b}|${m}`, p);
        p._primary = true;
      } else {
        p._primary = false; // duplicate Brand + Model → GRN/DC never reach it
      }
    } else {
      p._primary = true;
    }
  });
  return { byId, byBrandModel, products };
};

const findProductForInventory = (inv, maps) => {
  if (inv.linkedProduct) {
    const p = maps.byId.get(String(inv.linkedProduct));
    if (p) return { product: p, autoMatched: false };
  }
  const b = norm(inv.brandName), m = norm(inv.model);
  if (b && m) {
    const p = maps.byBrandModel.get(`${b}|${m}`);
    if (p) return { product: p, autoMatched: true };
  }
  return { product: null, autoMatched: false };
};

// ── Every GRN line / DC line of the company ─────────────────────────────────
const loadMovements = async (companyId) => {
  const company = toObjectId(companyId);

  const [grnRows, dcRows] = await Promise.all([
    GRN.aggregate([
      { $match: { company } },
      { $unwind: { path: '$items', includeArrayIndex: 'line' } },
      {
        $project: {
          docId: '$_id', line: 1,
          ref: '$grnNumber',
          date: { $ifNull: ['$grnDate', '$createdAt'] },
          enteredAt: '$createdAt',
          status: '$status', choice: '$choice',
          party: '$vendor', poId: '$purchaseOrder', createdBy: '$createdBy',
          brandName: '$items.brandName', modelNo: '$items.modelNo', productName: '$items.productName',
          qty: '$items.receivedQuantity', price: '$items.price', netValue: '$items.netValue', unit: '$items.unit',
        },
      },
    ]),
    DeliveryChallan.aggregate([
      { $match: { company } },
      { $unwind: { path: '$items', includeArrayIndex: 'line' } },
      {
        $project: {
          docId: '$_id', line: 1,
          ref: '$dcNumber',
          date: { $ifNull: ['$dcDate', '$createdAt'] },
          enteredAt: '$createdAt',
          status: '$status', choice: '$choice',
          party: '$customer', poNo: '$poNumber', createdBy: '$createdBy',
          brandName: '$items.brandName', modelNo: '$items.modelNo', productName: '$items.productName',
          qty: '$items.quantity', unit: '$items.unit',
        },
      },
    ]),
  ]);

  const group = (rows) => {
    const map = new Map();
    rows.forEach((r) => {
      const qty = num(r.qty);
      if (qty <= 0) return;
      // brand+model when present (same rule GRN/DC use for Product stock), else product name
      const key = sourceKey(r.brandName, r.modelNo, r.productName);
      if (!key) return;
      const row = {
        ...r,
        qty,
        date: r.date ? new Date(r.date) : new Date(0),
        enteredAt: r.enteredAt ? new Date(r.enteredAt) : null,
      };
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return map;
  };

  return { grn: group(grnRows), dc: group(dcRows) };
};

const collectRows = (map, keys, since) => {
  const seen = new Set();
  const rows = [];
  keys.forEach((k) => {
    (map.get(k) || []).forEach((r) => {
      const uid = `${r.docId}|${r.line}`;
      if (seen.has(uid) || r.date < since) return;
      seen.add(uid);
      rows.push(r);
    });
  });
  return rows;
};

// ── Raw ledger rows for one inventory item (names resolved later) ──────────
const rawEntriesForItem = (inv, product, movements) => {
  const keys = inventoryKeys(inv, product);
  const since = startOfDay(inv.openingDate || inv.createdAt);
  const grnRows = collectRows(movements.grn, keys, since);
  const dcRows = collectRows(movements.dc, keys, since);

  return [
    ...grnRows.map((r) => ({
      date: r.date, enteredAt: r.enteredAt, type: 'GRN', direction: 'in',
      ref: r.ref || '-', docId: r.docId, poId: r.poId, poNo: '',
      partyId: r.party, partyType: 'Vendor', byId: r.createdBy,
      in: r.qty, out: 0, rate: num(r.price), value: num(r.netValue), unit: r.unit || '',
      status: r.status || '', remark: [r.choice, r.status].filter(Boolean).join(' • '),
    })),
    ...dcRows.map((r) => ({
      date: r.date, enteredAt: r.enteredAt, type: 'DC', direction: 'out',
      ref: r.ref || '-', docId: r.docId, poId: null, poNo: r.poNo || '',
      partyId: r.party, partyType: 'Customer', byId: r.createdBy,
      in: 0, out: r.qty, rate: 0, value: 0, unit: r.unit || '',
      status: r.status || '', remark: [r.choice, r.status].filter(Boolean).join(' • '),
    })),
    ...(inv.transactions || []).map((t) => {
      const when = t.date ? new Date(t.date) : new Date(inv.createdAt);
      const isIn = t.type === 'incoming';
      const fromPM = t.source === 'product-master';
      const type = fromPM ? (isIn ? 'PM Adjust In' : 'PM Adjust Out') : (isIn ? 'Manual In' : 'Manual Out');
      return {
        date: when, enteredAt: when, type, direction: isIn ? 'in' : 'out',
        ref: '-', docId: t._id, poId: null, poNo: '',
        partyId: null, partyType: '', byId: t.by?._id || t.by,
        in: isIn ? num(t.quantity) : 0, out: isIn ? 0 : num(t.quantity), rate: 0, value: 0, unit: '',
        status: '', remark: t.reason || '',
      };
    }),
  ];
};

// Fill in user / vendor / customer / PO names for a list of rows
const resolveEntryNames = async (entries, extraUserIds = []) => {
  const userIds = [...entries.map((e) => e.byId), ...extraUserIds];
  const vendorIds = entries.filter((e) => e.partyType === 'Vendor').map((e) => e.partyId);
  const customerIds = entries.filter((e) => e.partyType === 'Customer').map((e) => e.partyId);
  const poIds = entries.map((e) => e.poId);

  const [users, vendors, customers, pos] = await Promise.all([
    lookupUsers(userIds),
    lookupNames('vendors', vendorIds, ['vendorName']),
    lookupNames('customers', customerIds, ['custName']),
    lookupNames('purchaseorders', poIds, ['orderNumber']),
  ]);

  const resolved = entries.map((e) => ({
    ...e,
    by: e.byName || users.get(String(e.byId)) || (e.byId ? 'Unknown user' : 'System'),
    party: e.partyType === 'Vendor'
      ? vendors.get(String(e.partyId)) || '-'
      : e.partyType === 'Customer'
        ? customers.get(String(e.partyId)) || '-'
        : '-',
    poNo: e.poNo || (e.poId ? pos.get(String(e.poId)) || '' : ''),
  }));
  return { resolved, users };
};

const cleanEntry = ({ byId, partyId, poId, docId, ...rest }) => ({
  ...rest,
  in: round(rest.in),
  out: round(rest.out),
  ...(rest.balance !== undefined ? { balance: round(rest.balance) } : {}),
});

const sortAsc = (a, b) =>
  (new Date(a.date) - new Date(b.date)) ||
  ((a.enteredAt ? new Date(a.enteredAt) : 0) - (b.enteredAt ? new Date(b.enteredAt) : 0));

// ── Full stock picture for one item ─────────────────────────────────────────
const enrichItem = (inv, maps, movements) => {
  const { product, autoMatched } = findProductForInventory(inv, maps);
  const entries = rawEntriesForItem(inv, product, movements);

  const openingStock = num(inv.openingStock ?? inv.currentStock, 0);
  const sum = (type, field) => entries.filter((e) => e.type === type).reduce((s, e) => s + e[field], 0);
  const grnIn = sum('GRN', 'in');
  const dcOut = sum('DC', 'out');
  const manualIn = sum('Manual In', 'in') + sum('PM Adjust In', 'in');
  const manualOut = sum('Manual Out', 'out') + sum('PM Adjust Out', 'out');

  const totalIn = grnIn + manualIn;
  const totalOut = dcOut + manualOut;
  const calculatedStock = openingStock + totalIn - totalOut;
  const live = tracksStock(product);
  const currentStock = live ? Math.max(0, num(product.currentStockQty, 0)) : Math.max(0, calculatedStock);

  const minStockLevel = num(inv.minStockLevel, 0);
  const price = num(inv.unitPrice) || num(inv.purchasePrice) || num(product?.purchasePrice);

  const sorted = [...entries].sort(sortAsc);
  const last = sorted[sorted.length - 1];

  return {
    ...inv,
    activityLog: undefined,
    linkedProduct: product ? product._id : inv.linkedProduct || null,
    linkedProductName: product ? product.productName : null,
    inProductMaster: !!product,
    duplicateProduct: !!(product && product._primary === false),
    stockSource: live ? 'product' : 'calculated',
    _autoMatched: autoMatched,
    _openingMissing: inv.openingStock === undefined || inv.openingStock === null,
    baseUOM: inv.baseUOM || product?.baseUOM || inv.unit || '',
    openingStock: round(openingStock),
    grnIn: round(grnIn),
    manualIn: round(manualIn),
    totalIn: round(totalIn),
    dcOut: round(dcOut),
    manualOut: round(manualOut),
    totalOut: round(totalOut),
    calculatedStock: round(calculatedStock),
    currentStock: round(currentStock),
    difference: round(currentStock - calculatedStock),
    minStockLevel,
    stockStatus: getStockStatus(currentStock, minStockLevel),
    stockValue: round(currentStock * price),
    grnCount: entries.filter((e) => e.type === 'GRN').length,
    dcCount: entries.filter((e) => e.type === 'DC').length,
    lastMovement: last ? { type: last.type, date: last.date, qty: round(last.in || last.out) } : null,
  };
};

const persistDerivedFields = async (enriched) => {
  const ops = enriched.map((e) => {
    const $set = { currentStock: e.currentStock };
    if (e._autoMatched && e.linkedProduct) $set.linkedProduct = e.linkedProduct;
    if (e._openingMissing) $set.openingStock = e.openingStock;
    return { updateOne: { filter: { _id: e._id }, update: { $set } } };
  });
  if (!ops.length) return;
  try {
    await Inventory.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.warn('[Inventory] persistDerivedFields failed:', err.message);
  }
};

const stripInternal = (e) => {
  const { _autoMatched, _openingMissing, activityLog, ...rest } = e;
  return rest;
};

const buildBaseQuery = (companyId, q, category) => {
  const query = { company: companyId };
  if (isValidParam(q)) {
    const rx = new RegExp(escapeRegex(String(q).trim()), 'i');
    query.$or = [
      { materialCode: rx }, { productName: rx }, { materialName: rx }, { brandName: rx },
      { model: rx }, { hsnCode: rx }, { productCategory: rx }, { description: rx },
      { warehouseLocation: rx }, { stockLocation: rx },
    ];
  }
  if (isValidParam(category)) query.category = String(category).trim();
  return query;
};

const loadEnriched = async (companyId, { q, category } = {}) => {
  const query = buildBaseQuery(companyId, q, category);
  const [items, maps, movements] = await Promise.all([
    Inventory.find(query).sort({ createdAt: -1, _id: -1 }).lean(),
    loadProductMaps(companyId),
    loadMovements(companyId),
  ]);
  return { enriched: items.map((inv) => enrichItem(inv, maps, movements)), maps, movements };
};

const buildSummary = (list, maps) => ({
  // ── Product Master ↔ Inventory match ──
  productMasterTotal: maps ? maps.byId.size : 0,
  productMasterStock: maps ? round([...maps.byId.values()].reduce((s, p) => s + Math.max(0, num(p.currentStockQty)), 0)) : 0,
  linkedProducts: new Set(list.filter((i) => i.inProductMaster).map((i) => String(i.linkedProduct))).size,
  linkedStock: round([...new Map(list.filter((i) => i.inProductMaster)
    .map((i) => [String(i.linkedProduct), i.currentStock])).values()].reduce((s, v) => s + v, 0)),
  notInProductMaster: list.filter((i) => !i.inProductMaster).length,
  mismatch: list.filter((i) => Math.abs(i.difference) > 0.0001).length,
  totalItems: list.length,
  inStock: list.filter((i) => i.stockStatus === 'In Stock').length,
  lowStock: list.filter((i) => i.stockStatus === 'Low Stock').length,
  outOfStock: list.filter((i) => i.stockStatus === 'Out of Stock').length,
  totalIn: round(list.reduce((s, i) => s + i.totalIn, 0)),
  totalOut: round(list.reduce((s, i) => s + i.totalOut, 0)),
  totalStockValue: round(list.reduce((s, i) => s + i.stockValue, 0)),
});

const applyStockFilter = (list, stockStatus) => {
  if (!isValidParam(stockStatus)) return list;
  if (stockStatus === 'mismatch') return list.filter((i) => Math.abs(i.difference) > 0.0001);
  if (stockStatus === 'not-linked') return list.filter((i) => !i.inProductMaster);
  if (stockStatus === 'auto') return list.filter((i) => i.autoCreated);
  const map = { 'out-of-stock': 'Out of Stock', 'low-stock': 'Low Stock', 'in-stock': 'In Stock' };
  return map[stockStatus] ? list.filter((i) => i.stockStatus === map[stockStatus]) : list;
};

const attachUserNames = async (items) => {
  const users = await lookupUsers(items.flatMap((i) => [i.createdBy, i.lastUpdatedBy]));
  return items.map((i) => ({
    ...i,
    createdByName: users.get(String(i.createdBy)) || '',
    lastUpdatedByName: users.get(String(i.lastUpdatedBy)) || '',
  }));
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/inventory?page=&limit=&q=&category=&stockStatus=
// ═════════════════════════════════════════════════════════════════════════════
exports.showAll = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 500);
    let page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const { q, category, stockStatus } = req.query;

    await safeSync(companyId); // every Product Master product gets an Inventory row

    const { enriched, maps } = await loadEnriched(companyId, { q, category });
    const summary = buildSummary(enriched, maps);
    const filtered = applyStockFilter(enriched, stockStatus);

    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / limit);
    if (totalPages > 0 && page > totalPages) page = totalPages;
    const pageItems = filtered.slice((page - 1) * limit, page * limit);

    persistDerivedFields(pageItems);
    const withNames = await attachUserNames(pageItems.map(stripInternal));

    res.status(200).json({
      success: true,
      data: withNames,
      summary,
      pagination: {
        currentPage: page, totalPages, totalRecords, limit,
        hasNextPage: page < totalPages, hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error in inventory showAll:', error);
    res.status(500).json({ success: false, error: 'Error while fetching inventory: ' + error.message });
  }
};

exports.search = async (req, res) => {
  req.query.q = req.query.q || req.query.search;
  return exports.showAll(req, res);
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/:id
// ═════════════════════════════════════════════════════════════════════════════
exports.getInventory = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const inv = await Inventory.findOne({ _id: req.params.id, company: companyId }).lean();
    if (!inv) return res.status(404).json({ success: false, error: 'Inventory item not found' });

    const [maps, movements, users] = await Promise.all([
      loadProductMaps(companyId),
      loadMovements(companyId),
      lookupUsers([inv.createdBy, inv.lastUpdatedBy, ...(inv.transactions || []).map((t) => t.by)]),
    ]);
    const item = stripInternal(enrichItem(inv, maps, movements));
    item.transactions = (inv.transactions || []).map((t) => ({ ...t, byName: users.get(String(t.by)) || 'System' }));
    item.createdByName = users.get(String(inv.createdBy)) || '';
    item.lastUpdatedByName = users.get(String(inv.lastUpdatedBy)) || '';

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error in getting inventory item: ' + error.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/:id/ledger
//   → Opening + every GRN / DC / Manual entry with who, when, party, running balance
//   → Activity log (create / edit history)
//   → Reconciliation (calculated vs live)
// ═════════════════════════════════════════════════════════════════════════════
exports.getStockLedger = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const inv = await Inventory.findOne({ _id: req.params.id, company: companyId }).lean();
    if (!inv) return res.status(404).json({ success: false, error: 'Inventory item not found' });

    const [maps, movements] = await Promise.all([loadProductMaps(companyId), loadMovements(companyId)]);
    const item = enrichItem(inv, maps, movements);
    const { product } = findProductForInventory(inv, maps);

    const raw = rawEntriesForItem(inv, product, movements).sort(sortAsc);
    const extraUsers = [inv.createdBy, inv.lastUpdatedBy, product?.createdBy, ...(inv.activityLog || []).map((a) => a.by)];
    const { resolved, users } = await resolveEntryNames(raw, extraUsers);

    let balance = item.openingStock;
    const entries = resolved.map((e) => {
      balance = balance + e.in - e.out;
      return cleanEntry({ ...e, balance });
    });

    // Activity log (+ synthetic "Created" for items made before the log existed)
    const activity = (inv.activityLog || []).map((a) => ({
      at: a.at, action: a.action, details: a.details || '', changes: a.changes || [],
      by: a.byName || users.get(String(a.by)) || 'System',
    }));
    if (!activity.some((a) => a.action === 'Created')) {
      // original opening = "from" of the first opening-stock change, else today's opening
      const firstOpeningChange = [...activity]
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .flatMap((a) => a.changes || [])
        .find((c) => c.field === 'openingStock');
      const originalOpening = firstOpeningChange ? firstOpeningChange.from : item.openingStock;
      activity.push({
        at: inv.createdAt, action: 'Created',
        details: `Opening stock ${originalOpening} ${item.baseUOM || ''}`.trim(),
        changes: [], by: users.get(String(inv.createdBy)) || 'Unknown user',
      });
    }
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    const totals = {
      opening: item.openingStock,
      grnIn: item.grnIn, manualIn: item.manualIn, totalIn: item.totalIn,
      dcOut: item.dcOut, manualOut: item.manualOut, totalOut: item.totalOut,
      calculatedStock: item.calculatedStock,
      currentStock: item.currentStock,
      difference: item.difference,
      stockSource: item.stockSource,
      matched: Math.abs(item.difference) < 0.0001,
    };

    res.status(200).json({
      success: true,
      item: {
        ...stripInternal(item),
        createdByName: users.get(String(inv.createdBy)) || '',
        lastUpdatedByName: users.get(String(inv.lastUpdatedBy)) || '',
      },
      product: product ? {
        _id: product._id,
        productName: product.productName,
        brandName: product.brandName,
        model: product.model,
        currentStockQty: num(product.currentStockQty),
        createdAt: product.createdAt,
        createdByName: users.get(String(product.createdBy)) || '',
        tracksStock: tracksStock(product),
        duplicate: product._primary === false,
      } : null,
      opening: {
        date: inv.openingDate || inv.createdAt,
        enteredAt: inv.createdAt,
        by: users.get(String(inv.createdBy)) || 'Unknown user',
        qty: item.openingStock,
      },
      entries,
      activity,
      totals,
    });
  } catch (error) {
    console.error('Error in getStockLedger:', error);
    res.status(500).json({ success: false, error: 'Error while fetching stock ledger: ' + error.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/movements?page=&limit=&q=&type=&from=&to=
//   → Stock History of ALL items (Opening / GRN / DC / Manual) with who & when
// ═════════════════════════════════════════════════════════════════════════════
exports.getAllMovements = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 10000);
    let page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const { q, type, from, to } = req.query;

    await safeSync(companyId);
    const [items, maps, movements] = await Promise.all([
      Inventory.find({ company: companyId }).lean(),
      loadProductMaps(companyId),
      loadMovements(companyId),
    ]);

    let rows = [];
    items.forEach((inv) => {
      const { product } = findProductForInventory(inv, maps);
      const info = {
        itemId: inv._id,
        materialCode: inv.materialCode,
        productName: inv.productName || product?.productName || inv.materialName || '',
        brandName: inv.brandName || product?.brandName || '',
        model: inv.model || product?.model || '',
        uom: inv.baseUOM || product?.baseUOM || '',
      };
      rows.push({
        ...info,
        date: inv.openingDate || inv.createdAt, enteredAt: inv.createdAt,
        type: 'Opening', direction: 'opening', ref: '-', poNo: '',
        partyType: '', partyId: null, byId: inv.createdBy,
        in: 0, out: 0, opening: num(inv.openingStock ?? inv.currentStock, 0),
        rate: 0, value: 0, status: '', remark: 'Opening stock',
      });
      rawEntriesForItem(inv, product, movements).forEach((e) => rows.push({ ...info, ...e }));
    });

    if (isValidParam(type)) rows = rows.filter((r) => r.type === type);
    if (isValidParam(from)) {
      const f = startOfDay(from);
      rows = rows.filter((r) => new Date(r.date) >= f);
    }
    if (isValidParam(to)) {
      const t = endOfDay(to);
      if (t) rows = rows.filter((r) => new Date(r.date) <= t);
    }

    const { resolved } = await resolveEntryNames(rows);
    let list = resolved;

    if (isValidParam(q)) {
      const s = String(q).trim().toLowerCase();
      list = list.filter((r) =>
        [r.materialCode, r.productName, r.brandName, r.model, r.ref, r.poNo, r.party, r.by, r.remark]
          .some((v) => String(v || '').toLowerCase().includes(s)));
    }

    list.sort((a, b) => sortAsc(b, a)); // newest first

    const totals = {
      count: list.length,
      totalIn: round(list.reduce((s, r) => s + r.in, 0)),
      totalOut: round(list.reduce((s, r) => s + r.out, 0)),
      byType: list.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {}),
    };

    const totalPages = Math.ceil(list.length / limit);
    if (totalPages > 0 && page > totalPages) page = totalPages;
    const data = list.slice((page - 1) * limit, page * limit).map(cleanEntry);

    res.status(200).json({
      success: true,
      data,
      totals,
      pagination: {
        currentPage: page, totalPages, totalRecords: list.length, limit,
        hasNextPage: page < totalPages, hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error in getAllMovements:', error);
    res.status(500).json({ success: false, error: 'Error while fetching stock history: ' + error.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCT MASTER ⇄ INVENTORY SYNC
// ─────────────────────────────────────────────────────────────────────────────
//  • Every Product Master product gets ONE Inventory row (auto code PM-0001…)
//  • An unlinked Inventory row with the same Brand + Model is linked instead
//    of creating a new one
//  • Opening stock of an auto row is back-calculated so that
//      Opening + GRN − DC (since the product was added) = Product Master stock
// ═════════════════════════════════════════════════════════════════════════════
const PRODUCT_GROUP_MAP = {
  'raw material': 'Raw Material', 'finish material': 'Finished Goods', 'finished goods': 'Finished Goods',
  'scrap': 'Scrap', 'repairing material': 'Repairing Material', 'work in progress': 'Raw Material',
};
const INVENTORY_TO_PRODUCT_GROUP = {
  'Raw Material': 'raw material', 'Finished Goods': 'finished goods', 'Repairing Material': 'repairing material',
  'Scrap': 'scrap', 'Asset': 'raw material',
};
const cut = (v, n) => (v === undefined || v === null ? '' : String(v).trim().slice(0, n));

// Identity fields always follow Product Master
const productIdentityFields = (p) => ({
  productName: cut(p.productName, 100),
  brandName: cut(p.brandName, 100),
  model: cut(p.model, 100),
  hsnCode: cut(p.hsnCode, 8),
  productCategory: cut(p.productCategory, 100),
  baseUOM: cut(p.baseUOM, 50),
});

const productToInventoryFields = (p) => ({
  ...productIdentityFields(p),
  materialName: cut(p.description || p.printName, 100),
  description: cut(p.description, 500),
  category: PRODUCT_GROUP_MAP[norm(p.category)] || 'Raw Material',
  uomConversion: Math.max(0, num(p.uomConversion, 1)) || 1,
  unitPrice: Math.max(0, num(p.purchasePrice)),
  purchasePrice: Math.max(0, num(p.purchasePrice)),
  mrp: Math.max(0, num(p.mrp)),
  salesPrice: Math.max(0, num(p.salesPrice)),
  minStockLevel: Math.max(0, num(p.minQtyLevel)),
  minQtyLevel: Math.max(0, num(p.minQtyLevel)),
  discountType: ['Zero Discount', 'In percentage', 'In Value'].includes(p.discountType) ? p.discountType : 'Zero Discount',
  discountValue: Math.max(0, num(p.discountValue)),
  taxType: p.taxType === 'gst' ? 'gst' : 'none',
  gstRate: p.taxType === 'gst' ? Math.max(0, num(p.gstRate)) : 0,
  gstEffectiveDate: p.taxType === 'gst' && p.gstEffectiveDate ? p.gstEffectiveDate : undefined,
});

const nextMaterialCodes = async (companyId, count) => {
  const docs = await Inventory.find({ company: companyId }).select('materialCode').lean();
  const used = new Set(docs.map((d) => String(d.materialCode || '').toLowerCase()));
  let max = docs.reduce((m, d) => {
    const hit = /^PM-(\d+)$/i.exec(d.materialCode || '');
    return hit ? Math.max(m, parseInt(hit[1], 10)) : m;
  }, 0);
  const codes = [];
  while (codes.length < count) {
    max += 1;
    const code = `PM-${String(max).padStart(4, '0')}`;
    if (!used.has(code.toLowerCase())) codes.push(code);
  }
  return codes;
};

const doSync = async (companyId) => {
  const company = toObjectId(companyId);
  const [products, invs] = await Promise.all([
    Product.find({ company }).sort({ createdAt: 1, _id: 1 }).lean(),
    Inventory.find({ company }).select('linkedProduct brandName model').lean(),
  ]);
  if (!products.length) return { created: 0, linked: 0 };

  const productIds = new Set(products.map((p) => String(p._id)));
  const linked = new Set(invs.map((i) => String(i.linkedProduct || '')).filter((id) => productIds.has(id)));

  // 1) link existing unlinked inventory rows by Brand + Model
  const firstByBM = new Map();
  products.forEach((p) => {
    const k = `${norm(p.brandName)}|${norm(p.model)}`;
    if (norm(p.brandName) && norm(p.model) && !firstByBM.has(k)) firstByBM.set(k, p);
  });
  const linkOps = [];
  invs.forEach((i) => {
    if (i.linkedProduct && productIds.has(String(i.linkedProduct))) return;
    const p = firstByBM.get(`${norm(i.brandName)}|${norm(i.model)}`);
    if (p && norm(i.brandName) && norm(i.model) && !linked.has(String(p._id))) {
      linked.add(String(p._id));
      linkOps.push({ updateOne: { filter: { _id: i._id }, update: { $set: { linkedProduct: p._id } } } });
    }
  });
  if (linkOps.length) await Inventory.bulkWrite(linkOps, { ordered: false });

  // 2) create an inventory row for every product that still has none
  const missing = products.filter((p) => !linked.has(String(p._id)));
  if (!missing.length) return { created: 0, linked: linkOps.length };

  const [maps, movements, codes] = await Promise.all([
    loadProductMaps(company),
    loadMovements(company),
    nextMaterialCodes(company, missing.length),
  ]);

  const docs = [];
  missing.forEach((p, idx) => {
    const mp = maps.byId.get(String(p._id)) || p;
    const since = startOfDay(p.createdAt);
    const keys = tracksStock(mp) && mp._primary !== false ? [`bm:${norm(p.brandName)}|${norm(p.model)}`] : [];
    const grnIn = collectRows(movements.grn, keys, since).reduce((s, r) => s + r.qty, 0);
    const dcOut = collectRows(movements.dc, keys, since).reduce((s, r) => s + r.qty, 0);
    const current = Math.max(0, num(p.currentStockQty));
    const opening = Math.max(0, round(current - grnIn + dcOut));
    const createdAt = p.createdAt ? new Date(p.createdAt) : new Date();

    const doc = new Inventory({
      ...productToInventoryFields(p),
      materialCode: codes[idx],
      openingStock: opening,
      currentStock: current,
      openingDate: createdAt,
      linkedProduct: p._id,
      autoCreated: true,
      company,
      createdBy: extractId(p.createdBy) || company,
      activityLog: [{
        action: 'Created',
        details: `Auto-added from Product Master (product added ${createdAt.toLocaleDateString('en-GB')}) • Opening stock ${opening} ${p.baseUOM || ''}`.trim(),
        by: extractId(p.createdBy) || company,
        at: createdAt,
      }],
    });
    const err = doc.validateSync();
    if (err) {
      console.warn(`[Inventory sync] product ${p._id} skipped:`, err.message);
      return;
    }
    const raw = doc.toObject({ depopulate: true });
    raw.createdAt = createdAt;   // "added on" = when the product was added
    raw.updatedAt = new Date();
    docs.push(raw);
  });

  if (!docs.length) return { created: 0, linked: linkOps.length };
  try {
    await Inventory.collection.insertMany(docs, { ordered: false });
  } catch (e) {
    if (e.code !== 11000) throw e; // duplicate code from a parallel sync → next load fills it
  }
  console.log(`[Inventory sync] company ${company}: ${docs.length} product(s) added, ${linkOps.length} linked`);
  return { created: docs.length, linked: linkOps.length };
};

// one sync at a time per company
const syncLocks = new Map();
const syncProductsToInventory = (companyId) => {
  const key = String(companyId);
  if (syncLocks.has(key)) return syncLocks.get(key);
  const p = doSync(companyId).finally(() => syncLocks.delete(key));
  syncLocks.set(key, p);
  return p;
};
const safeSync = async (companyId) => {
  try {
    return await syncProductsToInventory(companyId);
  } catch (e) {
    console.warn('[Inventory sync] failed:', e.message);
    return null;
  }
};

// ── Hooks called from productController ─────────────────────────────────────
const productCompany = (product, user) => extractId(product?.company) || getCompanyId(user || {});

// Product added → its Inventory row is created immediately
const onProductCreated = async (product, user) => {
  const companyId = productCompany(product, user);
  if (companyId) await safeSync(companyId);
};

// Product edited → name/brand/model/UOM follow; a direct stock edit is recorded
const onProductUpdated = async (before, after, user) => {
  try {
    if (!after?._id) return;
    const companyId = productCompany(after, user);
    const filter = { company: companyId, linkedProduct: after._id };
    const byName = userDisplayName(user);
    const identity = productIdentityFields(after);

    const changes = Object.entries(identity)
      .filter(([k, v]) => String(before?.[k] ?? '').trim() !== v)
      .map(([k, v]) => ({ field: k, label: TRACKED_FIELDS[k] || k, from: String(before?.[k] ?? ''), to: v }));

    const oldQty = Math.max(0, num(before?.currentStockQty));
    const newQty = Math.max(0, num(after.currentStockQty));
    const diff = round(newQty - oldQty);

    const push = { activityLog: { $each: [] } };
    if (changes.length) {
      push.activityLog.$each.push({
        action: 'Updated', details: `Product Master edited: ${changes.map((c) => c.label).join(', ')}`,
        changes, by: user?._id, byName, at: new Date(),
      });
    }
    if (diff !== 0) {
      push.transactions = {
        type: diff > 0 ? 'incoming' : 'outgoing',
        quantity: Math.abs(diff),
        reason: `Stock edited in Product Master (${oldQty} → ${newQty})`,
        date: new Date(),
        by: user?._id,
        source: 'product-master',
      };
      push.activityLog.$each.push({
        action: diff > 0 ? 'Stock In' : 'Stock Out',
        details: `Product Master stock edited ${oldQty} → ${newQty}`,
        by: user?._id, byName, at: new Date(),
      });
    }
    if (!push.activityLog.$each.length) delete push.activityLog;

    const ops = { $set: { ...identity, currentStock: newQty } };
    if (Object.keys(push).length) ops.$push = push;
    const res = await Inventory.updateMany(filter, ops);

    if (!res.matchedCount && !res.n) await safeSync(companyId); // not in inventory yet → add it
  } catch (e) {
    console.warn('[Inventory] onProductUpdated failed:', e.message);
  }
};

// Product deleted → auto rows without manual entries are removed, others are kept & unlinked
const onProductsDeleted = async (products, user) => {
  try {
    for (const p of products || []) {
      if (!p?._id) continue;
      const companyId = productCompany(p, user);
      const rows = await Inventory.find({ company: companyId, linkedProduct: p._id }).lean();
      for (const row of rows) {
        const hasManual = (row.transactions || []).some((t) => t.source !== 'product-master');
        if (row.autoCreated && !hasManual) {
          await Inventory.deleteOne({ _id: row._id });
        } else {
          await Inventory.updateOne({ _id: row._id }, {
            $set: { linkedProduct: null },
            $push: {
              activityLog: {
                action: 'Updated',
                details: `Product "${p.productName}" deleted from Product Master — item kept, stock now calculated`,
                by: user?._id, byName: userDisplayName(user), at: new Date(),
              },
            },
          });
        }
      }
    }
  } catch (e) {
    console.warn('[Inventory] onProductsDeleted failed:', e.message);
  }
};

exports.syncProductsToInventory = syncProductsToInventory;
exports.onProductCreated = onProductCreated;
exports.onProductUpdated = onProductUpdated;
exports.onProductsDeleted = onProductsDeleted;

// POST /api/inventory/sync  → manual "Sync with Product Master" button
exports.syncWithProductMaster = async (req, res) => {
  try {
    const result = await syncProductsToInventory(getCompanyId(req.user));
    res.status(200).json({
      success: true,
      message: `Sync done: ${result.created} product(s) added to inventory, ${result.linked} item(s) linked`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error while syncing with Product Master: ' + error.message });
  }
};

// ── shared: read + validate editable fields ─────────────────────────────────
const pickFields = (body) => {
  const fields = {};
  ['materialCode', 'materialName', 'warehouseLocation', 'stockLocation', 'description',
    'productName', 'brandName', 'model', 'hsnCode', 'productCategory', 'baseUOM', 'discountType', 'taxType']
    .forEach((f) => { if (body[f] !== undefined && body[f] !== null) fields[f] = String(body[f]).trim(); });

  ['unitPrice', 'minStockLevel', 'uomConversion', 'mrp', 'salesPrice', 'purchasePrice',
    'minQtyLevel', 'discountValue', 'gstRate']
    .forEach((f) => { if (body[f] !== undefined && body[f] !== null && body[f] !== '') fields[f] = Math.max(0, num(body[f])); });

  if (body.category !== undefined) {
    fields.category = Inventory.CATEGORY_VALUES.includes(body.category) ? body.category : 'Raw Material';
  }
  if (isValidParam(body.openingDate)) fields.openingDate = new Date(body.openingDate);
  if (fields.taxType && !['none', 'gst'].includes(fields.taxType)) fields.taxType = 'none';
  if (fields.taxType === 'gst') {
    if (isValidParam(body.gstEffectiveDate)) fields.gstEffectiveDate = new Date(body.gstEffectiveDate);
  } else if (fields.taxType === 'none') {
    fields.gstRate = 0;
    fields.gstEffectiveDate = null;
  }
  if (fields.discountType && !['Zero Discount', 'In percentage', 'In Value'].includes(fields.discountType)) {
    fields.discountType = 'Zero Discount';
  }
  if (fields.discountType === 'Zero Discount') fields.discountValue = 0;
  if (fields.unitPrice !== undefined && fields.purchasePrice === undefined) fields.purchasePrice = fields.unitPrice;
  if (fields.purchasePrice !== undefined && fields.unitPrice === undefined) fields.unitPrice = fields.purchasePrice;
  return fields;
};

const TRACKED_FIELDS = {
  materialCode: 'Material Code', productName: 'Product Name', materialName: 'Material Description',
  brandName: 'Brand', model: 'Model', hsnCode: 'HSN Code', category: 'Product Group',
  productCategory: 'Product Category', baseUOM: 'UOM', uomConversion: 'UOM Conversion',
  unitPrice: 'Purchase Price', mrp: 'MRP', salesPrice: 'Sales Price', minStockLevel: 'Min Stock Level',
  warehouseLocation: 'Warehouse', stockLocation: 'Rack', openingDate: 'Opening Date',
  discountType: 'Discount Type', discountValue: 'Discount', taxType: 'Tax', gstRate: 'GST %',
  description: 'Description',
};

const displayVal = (v) => {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().split('T')[0];
  return String(v);
};

const diffFields = (original, fields) => {
  const changes = [];
  Object.entries(TRACKED_FIELDS).forEach(([field, label]) => {
    if (fields[field] === undefined) return;
    const before = field === 'openingDate' && original[field] ? new Date(original[field]) : original[field];
    const a = displayVal(before);
    const b = displayVal(fields[field]);
    const same = typeof fields[field] === 'number' ? num(a) === num(b) : a === b;
    if (!same) changes.push({ field, label, from: a, to: b });
  });
  return changes;
};

const resolveLinkedProduct = async (companyId, linkedProductId) => {
  if (!isValidParam(linkedProductId) || !mongoose.Types.ObjectId.isValid(String(linkedProductId))) return null;
  return Product.findOne({ _id: linkedProductId, company: companyId }).lean();
};

const incProductStock = async (productId, delta) => {
  if (!productId || !delta) return;
  await Product.updateOne({ _id: productId }, [
    { $set: { currentStockQty: { $max: [0, { $add: [{ $ifNull: ['$currentStockQty', 0] }, delta] }] } } },
  ]);
};

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/inventory
// ═════════════════════════════════════════════════════════════════════════════
exports.create = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const fields = pickFields(req.body);

    if (!fields.materialCode) {
      return res.status(400).json({ success: false, error: 'Material Code is required' });
    }

    const exists = await Inventory.findOne({
      company: companyId,
      materialCode: new RegExp(`^${escapeRegex(fields.materialCode)}$`, 'i'),
    }).lean();
    if (exists) {
      return res.status(409).json({ success: false, error: `Material code "${fields.materialCode}" already exists` });
    }

    const openingRaw = req.body.openingStock ?? req.body.currentStock;
    const openingProvided = openingRaw !== undefined && openingRaw !== null && openingRaw !== '';
    const openingStock = Math.max(0, num(openingRaw, 0));

    let product = await resolveLinkedProduct(companyId, req.body.linkedProductId);
    if (!product && fields.brandName && fields.model) {
      product = await Product.findOne({
        company: companyId,
        brandName: new RegExp(`^${escapeRegex(fields.brandName)}$`, 'i'),
        model: new RegExp(`^${escapeRegex(fields.model)}$`, 'i'),
      }).lean();
    }

    // Product already has an Inventory row → complete that row instead of making a duplicate
    if (product) {
      const existingRow = await Inventory.findOne({ company: companyId, linkedProduct: product._id }).lean();
      if (existingRow && !existingRow.autoCreated) {
        return res.status(409).json({
          success: false,
          error: `"${product.productName}" is already in Inventory as ${existingRow.materialCode}. Edit that item instead.`,
        });
      }
      if (existingRow && existingRow.autoCreated) {
        const changes = diffFields(existingRow, fields);
        const setFields = {
          ...fields,
          autoCreated: false,
          lastUpdatedBy: req.user._id,
        };
        const oldOpening = num(existingRow.openingStock, 0);
        if (openingProvided && openingStock !== oldOpening) {
          setFields.openingStock = openingStock;
          changes.push({ field: 'openingStock', label: 'Opening Stock', from: String(oldOpening), to: String(openingStock) });
        }
        await Inventory.updateOne({ _id: existingRow._id }, {
          $set: setFields,
          $push: {
            activityLog: {
              action: 'Updated',
              details: `Inventory details completed (was auto-added as ${existingRow.materialCode})`,
              changes, by: req.user._id, byName: userDisplayName(req.user), at: new Date(),
            },
          },
        });
        if (setFields.openingStock !== undefined) await incProductStock(product._id, openingStock - oldOpening);
        return res.status(200).json({
          success: true,
          message: `"${product.productName}" was already auto-added from Product Master — details saved to that item (${fields.materialCode})`,
          linkedToProduct: true,
          merged: true,
        });
      }
    }

    // Not in Product Master yet → create it there too, so both masters always match
    let productCreated = false;
    if (!product && fields.productName && fields.baseUOM && req.body.createInProductMaster !== false) {
      try {
        const newProduct = await Product.create({
          productName: fields.productName,
          brandName: fields.brandName,
          model: fields.model,
          hsnCode: fields.hsnCode,
          description: fields.description || fields.materialName,
          productCategory: fields.productCategory,
          baseUOM: fields.baseUOM,
          uomConversion: fields.uomConversion || 1,
          category: INVENTORY_TO_PRODUCT_GROUP[fields.category] || 'raw material',
          mrp: fields.mrp || 0,
          salesPrice: fields.salesPrice || 0,
          purchasePrice: fields.unitPrice || 0,
          minQtyLevel: fields.minStockLevel || 0,
          discountType: fields.discountType || 'Zero Discount',
          discountValue: fields.discountValue || 0,
          currentStockQty: openingStock,
          taxType: fields.taxType || 'none',
          gstRate: fields.gstRate || 0,
          gstEffectiveDate: fields.gstEffectiveDate || undefined,
          company: companyId,
          createdBy: req.user._id,
        });
        product = newProduct.toObject();
        productCreated = true;
      } catch (e) {
        console.warn('[Inventory] could not auto-create product:', e.message);
      }
    }

    const details = [
      `Opening stock ${openingStock} ${fields.baseUOM || ''}`.trim(),
      productCreated
        ? `also added to Product Master "${product.productName}"`
        : product ? `linked to Product Master "${product.productName}"` : 'not in Product Master (Product Name + Base UOM needed)',
      product && openingProvided && num(product.currentStockQty) !== openingStock
        ? `Product Master stock set ${num(product.currentStockQty)} → ${openingStock}` : '',
    ].filter(Boolean).join(' • ');

    const newInventory = new Inventory({
      ...fields,
      openingStock,
      currentStock: openingStock,
      linkedProduct: product ? product._id : null,
      openingDate: fields.openingDate || new Date(),
      company: companyId,
      createdBy: req.user._id,
      activityLog: [{ action: 'Created', details, by: req.user._id, byName: userDisplayName(req.user), at: new Date() }],
    });
    await newInventory.save();

    if (product && !productCreated && openingProvided && num(product.currentStockQty) !== openingStock) {
      await Product.updateOne({ _id: product._id }, { $set: { currentStockQty: openingStock } });
    }

    res.status(201).json({
      success: true,
      message: productCreated
        ? `Material ${fields.materialCode} created and added to Product Master`
        : `Material ${fields.materialCode} has been created successfully`,
      data: newInventory,
      linkedToProduct: !!product,
      productCreated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Material code already exists' });
    }
    res.status(400).json({ success: false, error: 'Error while creating inventory item: ' + error.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// PUT /api/inventory/:id   (edit details and/or stock transaction)
// ═════════════════════════════════════════════════════════════════════════════
exports.updateInventory = async (req, res) => {
  try {
    const companyId = getCompanyId(req.user);
    const { id } = req.params;
    const byName = userDisplayName(req.user);

    const original = await Inventory.findOne({ _id: id, company: companyId }).lean();
    if (!original) return res.status(404).json({ success: false, error: 'Inventory item not found' });

    const fields = pickFields(req.body);

    if (fields.materialCode === '') {
      return res.status(400).json({ success: false, error: 'Material Code is required' });
    }
    if (fields.materialCode && fields.materialCode.toLowerCase() !== String(original.materialCode).toLowerCase()) {
      const dup = await Inventory.findOne({
        company: companyId,
        _id: { $ne: id },
        materialCode: new RegExp(`^${escapeRegex(fields.materialCode)}$`, 'i'),
      }).lean();
      if (dup) return res.status(409).json({ success: false, error: `Material code "${fields.materialCode}" already exists` });
    }

    let linkedProductId = original.linkedProduct;
    if (req.body.linkedProductId !== undefined) {
      const p = await resolveLinkedProduct(companyId, req.body.linkedProductId);
      linkedProductId = p ? p._id : null;
    }

    const oldOpening = num(original.openingStock ?? original.currentStock, 0);
    let newOpening = oldOpening;
    if (req.body.openingStock !== undefined && req.body.openingStock !== '' && req.body.openingStock !== null) {
      newOpening = Math.max(0, num(req.body.openingStock));
    }

    const update = { ...fields, openingStock: newOpening, linkedProduct: linkedProductId, lastUpdatedBy: req.user._id };
    const activity = [];

    const changes = diffFields(original, fields);
    if (newOpening !== oldOpening) {
      changes.push({ field: 'openingStock', label: 'Opening Stock', from: String(oldOpening), to: String(newOpening) });
    }
    if (String(linkedProductId || '') !== String(original.linkedProduct || '')) {
      changes.push({ field: 'linkedProduct', label: 'Product Master link', from: original.linkedProduct ? 'Linked' : 'None', to: linkedProductId ? 'Linked' : 'None' });
    }
    if (changes.length) {
      activity.push({
        action: 'Updated',
        details: changes.map((c) => c.label).join(', '),
        changes, by: req.user._id, byName, at: new Date(),
      });
    }

    const txn = req.body.transaction;
    let txnRecord = null;
    if (txn && txn.quantity) {
      const qty = num(txn.quantity);
      if (qty <= 0) return res.status(400).json({ success: false, error: 'Transaction quantity must be greater than 0' });
      if (!['incoming', 'outgoing'].includes(txn.type)) {
        return res.status(400).json({ success: false, error: 'Transaction type must be incoming or outgoing' });
      }
      if (!txn.reason || !String(txn.reason).trim()) {
        return res.status(400).json({ success: false, error: 'Please provide a reason for the transaction' });
      }

      const [maps, movements] = await Promise.all([loadProductMaps(companyId), loadMovements(companyId)]);
      const live = enrichItem({ ...original, linkedProduct: linkedProductId, openingStock: newOpening }, maps, movements);
      // Product Master stock has not yet received this save's opening-stock change → add it here
      const sameLink = String(linkedProductId || '') === String(original.linkedProduct || '');
      const stockNow = round(live.currentStock + (live.stockSource === 'product' && sameLink ? newOpening - oldOpening : 0));
      if (txn.type === 'outgoing' && qty > stockNow) {
        return res.status(400).json({
          success: false,
          error: `Outgoing quantity (${qty}) cannot exceed current stock (${stockNow})`,
        });
      }

      txnRecord = {
        type: txn.type,
        quantity: qty,
        reason: String(txn.reason).trim().slice(0, 200),
        date: txn.date ? new Date(txn.date) : new Date(),
        by: req.user._id,
      };
      const after = txn.type === 'incoming' ? stockNow + qty : stockNow - qty;
      activity.push({
        action: txn.type === 'incoming' ? 'Stock In' : 'Stock Out',
        details: `${txn.type === 'incoming' ? '+' : '−'}${qty} (${stockNow} → ${round(after)}) • ${txnRecord.reason}`,
        changes: [], by: req.user._id, byName, at: new Date(),
      });
    }

    const ops = { $set: update };
    const push = {};
    if (txnRecord) push.transactions = txnRecord;
    if (activity.length) push.activityLog = { $each: activity };
    if (Object.keys(push).length) ops.$push = push;

    await Inventory.updateOne({ _id: id }, ops, { runValidators: true });

    if (linkedProductId) {
      let delta = 0;
      if (String(linkedProductId) === String(original.linkedProduct || '')) delta += newOpening - oldOpening;
      if (txnRecord) delta += txnRecord.type === 'incoming' ? txnRecord.quantity : -txnRecord.quantity;
      await incProductStock(linkedProductId, delta);
    }

    const [maps, movements, fresh] = await Promise.all([
      loadProductMaps(companyId),
      loadMovements(companyId),
      Inventory.findById(id).lean(),
    ]);
    const enriched = enrichItem(fresh, maps, movements);
    await Inventory.updateOne({ _id: id }, { $set: { currentStock: enriched.currentStock } });

    res.status(200).json({
      success: true,
      message: txnRecord
        ? `Stock ${txnRecord.type === 'incoming' ? 'added' : 'reduced'} successfully. Current stock: ${enriched.currentStock}`
        : changes.length ? 'Inventory item updated successfully' : 'No changes to save',
      data: stripInternal(enriched),
    });
  } catch (error) {
    console.error('Error in updateInventory:', error);
    res.status(400).json({ success: false, error: 'Error while updating inventory item: ' + error.message });
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/inventory/:id
// ═════════════════════════════════════════════════════════════════════════════
exports.deleteInventory = async (req, res) => {
  try {
    const inventory = await Inventory.findOneAndDelete({ _id: req.params.id, company: getCompanyId(req.user) });
    if (!inventory) return res.status(404).json({ success: false, error: 'Inventory item not found' });
    console.log(`[Inventory] ${inventory.materialCode} deleted by ${userDisplayName(req.user)} (${req.user._id}) at ${new Date().toISOString()}`);
    res.status(200).json({ success: true, message: `Material ${inventory.materialCode} has been deleted successfully` });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Error while deleting inventory item: ' + error.message });
  }
};

// GET /api/inventory/low-stock
exports.getLowStockItems = async (req, res) => {
  try {
    const { enriched } = await loadEnriched(getCompanyId(req.user));
    const low = enriched
      .filter((i) => i.stockStatus !== 'In Stock')
      .sort((a, b) => a.currentStock - b.currentStock)
      .map(stripInternal);
    res.status(200).json({ success: true, data: low, count: low.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error while fetching low stock items: ' + error.message });
  }
};

// GET /api/inventory/category/:category
exports.getInventoryByCategory = async (req, res) => {
  try {
    const { enriched } = await loadEnriched(getCompanyId(req.user), { category: req.params.category });
    res.status(200).json({ success: true, data: enriched.map(stripInternal), count: enriched.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error while fetching inventory by category: ' + error.message });
  }
};

// GET /api/inventory/:id/transactions  (manual transactions)
exports.getTransactionHistory = async (req, res) => {
  try {
    const inventory = await Inventory.findOne({ _id: req.params.id, company: getCompanyId(req.user) })
      .select('transactions').lean();
    if (!inventory) return res.status(404).json({ success: false, error: 'Inventory item not found' });
    const users = await lookupUsers((inventory.transactions || []).map((t) => t.by));
    res.status(200).json({
      success: true,
      data: (inventory.transactions || []).map((t) => ({ ...t, byName: users.get(String(t.by)) || 'System' })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error while fetching transaction history: ' + error.message });
  }
};