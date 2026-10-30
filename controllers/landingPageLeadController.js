const { Types } = require('mongoose');
const LandingPageLead = require('../models/landingPageLeadModel');
const Lead = require('../models/leadsModel');
const { logLeadCreation } = require('../middlewares/activityLogger');

// ══════════════════════════════════════════════════════════════
//  CONFIG from .env → LANDING_PAGE_1_..., LANDING_PAGE_2_..., ...
// ══════════════════════════════════════════════════════════════
const normalizeHost = (v) => {
  let s = String(v || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  // strip ":port" only for host:port (not IPv6 like ::1)
  if ((s.match(/:/g) || []).length === 1) s = s.replace(/:\d+$/, '');
  return s;
};

const getLandingPages = () => {
  const pages = [];
  for (let i = 1; i <= 10; i++) {
    const key  = (process.env[`LANDING_PAGE_${i}_KEY`]  || '').trim();
    const name = (process.env[`LANDING_PAGE_${i}_NAME`] || '').trim();
    if (!key || !name) continue;
    const allowed = (process.env[`LANDING_PAGE_${i}_ALLOWED`] || '')
      .split(',').map(normalizeHost).filter(Boolean);
    pages.push({ key, name, allowed });
  }
  return pages;
};

const getHostFromUrl = (v) => {
  try { return new URL(v).hostname.toLowerCase(); } catch { return ''; }
};

const getClientIp = (req) => {
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '')
    .replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip;
};

// Allowed if Origin domain / Referer domain / client IP is in list (empty list = allow all)
const isRequestAllowed = (req, allowed) => {
  if (!allowed.length) return true;
  const originHost  = getHostFromUrl(req.get('origin'));
  const refererHost = getHostFromUrl(req.get('referer'));
  const ip          = getClientIp(req);
  return [originHost, refererHost, ip].some(v => v && allowed.includes(v));
};

// ✅ Read API key from Header (recommended) OR URL (?x-api-key= / ?apiKey=) OR body.apiKey
const getApiKeyFromRequest = (req) => String(
  req.get('x-api-key') ||
  (req.query && (req.query['x-api-key'] || req.query.apiKey)) ||
  (req.body && (req.body['x-api-key'] || req.body.apiKey)) ||
  ''
).trim();

const clean = (v, max) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const getISTDayRange = (dateStr) => ({
  start: new Date(`${dateStr}T00:00:00+05:30`),
  end:   new Date(`${dateStr}T23:59:59.999+05:30`),
});

// ── Creates a normal Marketing lead (same as "Add Lead") ──
const createMarketingLead = async (lpLead, companyId, actorId) => {
  const lead = new Lead({
    company:            new Types.ObjectId(companyId),
    SOURCE:             'Website',
    SENDER_NAME:        lpLead.name,
    SENDER_EMAIL:       lpLead.email,
    SENDER_MOBILE:      lpLead.phone,
    SUBJECT:            `Landing Page: ${lpLead.landingPage}`,
    QUERY_PRODUCT_NAME: lpLead.landingPage,     // brand shows in "Product" column
    QUERY_MESSAGE:      lpLead.remark,
    QUERY_TIME:         lpLead.createdAt,
    feasibility:        'none',                 // → Marketing Master list
    callLeads:          'Warm Leads',
    callHistory:        [],
    assignedTo:         actorId ? new Types.ObjectId(actorId) : null,
    ...(actorId && { assignedBy: new Types.ObjectId(actorId) }),
    assignedTime:       new Date(),
  });
  await lead.save();
  return lead;
};

// ══════════════════════════════════════════════════════════════
//  PUBLIC: landing page form submit
//  POST /api/public/landing-leads/submit
//  Key: header x-api-key  |  ?x-api-key=  |  ?apiKey=  |  body.apiKey
// ══════════════════════════════════════════════════════════════
exports.submitLandingPageLead = async (req, res) => {
  try {
    const apiKey = getApiKeyFromRequest(req);
    const pages  = getLandingPages();
    const page   = pages.find(p => p.key === apiKey);

    if (!apiKey || !page) {
      // Helpful debug line (does not print your real keys)
      console.warn(
        `⛔ Landing page 401 — received key: "${apiKey || '(empty)'}" | ` +
        `configured pages in .env: ${pages.length ? pages.map(p => p.name).join(', ') : 'NONE (check .env + restart server)'}`
      );
      return res.status(401).json({ success: false, error: 'Invalid or missing API key.' });
    }

    if (!isRequestAllowed(req, page.allowed)) {
      console.warn(`⛔ Landing page "${page.name}" blocked — origin: ${req.get('origin')} ip: ${getClientIp(req)}`);
      return res.status(403).json({ success: false, error: 'Request not allowed from this domain/IP.' });
    }

    const companyId = process.env.LANDING_PAGE_COMPANY_ID;
    if (!companyId || !Types.ObjectId.isValid(companyId)) {
      console.error('❌ LANDING_PAGE_COMPANY_ID missing/invalid in .env');
      return res.status(500).json({ success: false, error: 'Server not configured.' });
    }

    const body = req.body || {};
    if (body.website) { // honeypot (bots fill hidden field)
      return res.status(200).json({ success: true, message: 'Thank you! We will contact you soon.' });
    }

    const name    = clean(body.name, 100);
    const email   = clean(body.email, 150).toLowerCase();
    const phone   = clean(body.phone, 20).replace(/[^\d+]/g, '');
    const remark  = clean(body.remark, 1000);
    const pageUrl = clean(body.pageUrl || req.get('referer') || '', 300);

    const errors = [];
    if (name.length < 2) errors.push('name is required (min 2 characters).');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) errors.push('phone must have 10 to 15 digits.');
    if (email && !EMAIL_RE.test(email)) errors.push('email is not valid.');
    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join(' '), errors });
    }

    // Same phone + same page within 10 min → don't create twice
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const dup = await LandingPageLead.findOne({
      company: companyId, landingPage: page.name, phone, createdAt: { $gte: tenMinAgo },
    }).select('_id').lean();
    if (dup) {
      return res.status(200).json({ success: true, duplicate: true, message: 'Thank you! We have already received your details.' });
    }

    const lpLead = await LandingPageLead.create({
      company: companyId,
      landingPage: page.name,
      name, email, phone, remark, pageUrl,
      ipAddress: getClientIp(req),
      userAgent: clean(req.get('user-agent'), 300),
    });

    // ✅ Auto add into Marketing Master
    if (process.env.LANDING_PAGE_AUTO_TO_MARKETING === 'true') {
      try {
        const lead = await createMarketingLead(lpLead, companyId, null);
        lpLead.status      = 'moved';
        lpLead.autoMoved   = true;
        lpLead.movedAt     = new Date();
        lpLead.movedToLead = lead._id;
        await lpLead.save();
      } catch (e) {
        console.error('⚠️ Auto move to Marketing failed (non-blocking):', e.message);
      }
    }

    console.log(`✅ Landing page lead received: ${page.name} — ${name} (${phone})`);
    return res.status(201).json({ success: true, message: 'Thank you! We will contact you soon.' });
  } catch (error) {
    console.error('Landing page submit error:', error);
    return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

// ══════════════════════════════════════════════════════════════
//  CRM: list + tabs per landing page
// ══════════════════════════════════════════════════════════════
exports.getLandingPageLeads = async (req, res) => {
  try {
    const user      = req.user;
    const companyId = new Types.ObjectId(user.company || user._id);
    const page  = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;
    const { landingPage, status, date, search } = req.query;

    const query = { company: companyId };
    if (landingPage) query.landingPage = String(landingPage);
    if (status && ['new', 'moved'].includes(status)) query.status = status;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' });
      }
      const { start, end } = getISTDayRange(date);
      query.createdAt = { $gte: start, $lte: end };
    }
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim().slice(0, 100)), 'i');
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { remark: rx }];
    }

    const [leads, totalRecords, agg] = await Promise.all([
      LandingPageLead.find(query).populate('movedBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LandingPageLead.countDocuments(query),
      LandingPageLead.aggregate([
        { $match: { company: companyId } },
        { $group: { _id: { lp: '$landingPage', st: '$status' }, count: { $sum: 1 } } },
      ]),
    ]);

    const pageMap = {};
    if (String(companyId) === String(process.env.LANDING_PAGE_COMPANY_ID)) {
      getLandingPages().forEach(p => {
        pageMap[p.name] = { name: p.name, total: 0, newCount: 0, movedCount: 0 };
      });
    }
    let total = 0, newCount = 0, movedCount = 0;
    agg.forEach(({ _id, count }) => {
      if (!pageMap[_id.lp]) pageMap[_id.lp] = { name: _id.lp, total: 0, newCount: 0, movedCount: 0 };
      pageMap[_id.lp].total += count;
      total += count;
      if (_id.st === 'new')   { pageMap[_id.lp].newCount   += count; newCount   += count; }
      if (_id.st === 'moved') { pageMap[_id.lp].movedCount += count; movedCount += count; }
    });

    const totalPages = Math.ceil(totalRecords / limit);
    return res.status(200).json({
      success: true,
      leads,
      stats: { total, newCount, movedCount, landingPages: Object.values(pageMap) },
      pagination: {
        currentPage: page, totalPages, totalRecords, limit,
        hasNextPage: page < totalPages, hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching landing page leads:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.getLandingPageLeadStats = async (req, res) => {
  try {
    const companyId = new Types.ObjectId(req.user.company || req.user._id);
    const [total, newCount] = await Promise.all([
      LandingPageLead.countDocuments({ company: companyId }),
      LandingPageLead.countDocuments({ company: companyId, status: 'new' }),
    ]);
    return res.status(200).json({ success: true, total, newCount });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

// ══════════════════════════════════════════════════════════════
//  CRM: manual Move to Marketing (for leads still "new")
// ══════════════════════════════════════════════════════════════
const moveOne = async (id, user, req) => {
  if (!Types.ObjectId.isValid(id)) return { ok: false, code: 400, error: 'Invalid lead ID.' };
  const companyId = user.company || user._id;

  const lpLead = await LandingPageLead.findOneAndUpdate(
    { _id: id, company: companyId, status: 'new' },
    { $set: { status: 'moved', movedBy: user._id, movedAt: new Date() } },
    { new: true }
  );
  if (!lpLead) {
    const exists = await LandingPageLead.exists({ _id: id, company: companyId });
    return exists
      ? { ok: false, code: 400, error: 'This lead is already in Marketing.' }
      : { ok: false, code: 404, error: 'Landing page lead not found.' };
  }

  try {
    const lead = await createMarketingLead(lpLead, companyId, user._id);
    lpLead.movedToLead = lead._id;
    await lpLead.save();
    try { await logLeadCreation(lead, user, req); }
    catch (e) { console.error('Activity log failed (non-blocking):', e.message); }
    return { ok: true, leadId: lead._id };
  } catch (err) {
    await LandingPageLead.updateOne(
      { _id: lpLead._id },
      { $set: { status: 'new', movedBy: null, movedAt: null, movedToLead: null } }
    );
    return { ok: false, code: 500, error: 'Failed to move lead: ' + err.message };
  }
};

exports.moveToMarketing = async (req, res) => {
  try {
    const r = await moveOne(req.params.id, req.user, req);
    if (!r.ok) return res.status(r.code).json({ success: false, error: r.error });
    return res.status(200).json({ success: true, message: 'Lead moved to Marketing Master.', leadId: r.leadId });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.moveBulkToMarketing = async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one lead.' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ success: false, error: 'Maximum 100 leads at a time.' });
    }
    let moved = 0, failed = 0;
    for (const id of ids) {
      const r = await moveOne(String(id), req.user, req);
      r.ok ? moved++ : failed++;
    }
    return res.status(200).json({
      success: moved > 0, moved, failed,
      message: `${moved} lead(s) moved to Marketing${failed ? `, ${failed} skipped` : ''}.`,
      ...(moved === 0 && { error: 'No leads were moved (already moved or not found).' }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};

exports.deleteLandingPageLead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, error: 'Invalid lead ID.' });
    const deleted = await LandingPageLead.findOneAndDelete({
      _id: id, company: new Types.ObjectId(req.user.company || req.user._id),
    });
    if (!deleted) return res.status(404).json({ success: false, error: 'Landing page lead not found.' });
    return res.status(200).json({ success: true, message: 'Landing page lead deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error: ' + error.message });
  }
};