const mongoose = require('mongoose');
const Ticket = require('../models/ticketModel');
const Customer = require('../models/customerModel');
const ExternalTicket = require('../models/externalTicketModel');

const BASE_URL    = process.env.EXTERNAL_TICKETS_URL;
const TOKEN       = process.env.EXTERNAL_TICKETS_TOKEN;
const COMPANY     = process.env.EXTERNAL_COMPANY_ID;
const START_ID    = Number(process.env.EXTERNAL_START_ID || 0);
const PAGE_SIZE   = Number(process.env.EXTERNAL_PAGE_SIZE || 50);
const SKIP_CLOSED = process.env.EXTERNAL_SKIP_CLOSED === 'true';

const TIMEOUT_MS = 30 * 1000;
const LOCK_MS    = 10 * 60 * 1000;
const MAX_PAGES  = 200;
const STATE_ID   = 'external-tickets';

// Their product name -> your product name (optional)
const PRODUCT_MAP = {
  // smartentry: 'Access Control System',
  // smartgate: 'Entrance Automation',
};

const EMAIL_RE = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;

const stateCol = () => mongoose.connection.db.collection('externalsyncstates');

// ID is in ticket.Uniqueid (nested), Uniqueid (flat, current API) or id (old format)
const getId = (t) => Number(t?.ticket?.Uniqueid ?? t?.Uniqueid ?? t?.id);

async function acquireLock() {
  const now = new Date();
  try {
    const r = await stateCol().findOneAndUpdate(
      {
        _id: STATE_ID,
        $or: [
          { lockUntil: null },
          { lockUntil: { $exists: false } },
          { lockUntil: { $lt: now } },
        ],
      },
      {
        $set: { lockUntil: new Date(now.getTime() + LOCK_MS) },
        $setOnInsert: { lastId: START_ID },
      },
      { upsert: true, returnDocument: 'after' }
    );
    return (r && r.value !== undefined) ? r.value : r;
  } catch (e) {
    if (e.code === 11000) return null;
    throw e;
  }
}

const saveLastId = (lastId) =>
  stateCol().updateOne({ _id: STATE_ID }, { $set: { lastId, updatedAt: new Date() } });

const releaseLock = () =>
  stateCol().updateOne({ _id: STATE_ID }, { $set: { lockUntil: null } });

async function fetchPage(afterId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}?after_id=${afterId}&limit=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: ctrl.signal,
    });
    if (res.status === 401) {
      throw new Error('External API 401: token expired or invalid. Update EXTERNAL_TICKETS_TOKEN and restart.');
    }
    if (!res.ok) throw new Error(`External API status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function findClientId(name) {
  if (!name) return null;
  const esc = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const c = await Customer.findOne({
    company: COMPANY,
    custName: new RegExp('^' + esc + '$', 'i'),
  }).select('_id').lean();
  return c ? c._id : null;
}

// returns 'added' or 'skipped'
async function importOne(t) {
  const id = getId(t);
  if (!Number.isFinite(id)) {
    console.error('External ticket skipped: no ID found');
    return 'skipped';
  }
  const uid = `EXT-${id}`;
  const x = t.ticket || t;   // flat format has fields at top level

  // keep the full raw external data (used by the eye button)
  await ExternalTicket.updateOne(
    { externalId: id },
    { $set: { company: COMPANY, data: t } },
    { upsert: true }
  );

  if (await Ticket.exists({ uniqueTicketId: uid })) return 'skipped';

  const status = String(x.Ticket_Status || t.status || '').toLowerCase();
  if (SKIP_CLOSED && (status === 'closed' || t.closedDate)) return 'skipped';

  const clientName = t.clientName || x.Company_Name;
  const clientId = await findClientId(clientName);

  let details = t.complaintDetails
    || (x.Ticket_Details ? `[${x.Ticket_Category || 'Ticket'}] ${x.Ticket_Details}` : 'No details');
  if (!clientId && clientName) details = `[Client: ${clientName}] ${details}`;

  const emailRaw = t.contactPersonEmail || x.Company_Email || '';
  const email = EMAIL_RE.test(emailRaw) ? emailRaw : 'na@na.com';
  const phoneDigits = String(t.contactPersonNo || '').replace(/\D/g, '');
  const productRaw = t.product || x.Product_Name || t.category || 'CRM';

  const created = new Date(x.Ticket_Creation_Date || t.createdAt || t.date || Date.now());

  const ticket = new Ticket({
    company: COMPANY,
    date: isNaN(created.getTime()) ? new Date() : created,
    client: clientId,
    Address: {
      add: t.address || 'N/A',
      city: t.city || 'N/A',
      state: t.state || 'N/A',
      country: t.country || 'India',
      pincode: Number(t.pincode) || 0,
    },
    details: details.slice(0, 500),
    product: PRODUCT_MAP[String(productRaw).toLowerCase()] || productRaw,
    contactPerson: t.contactPersonName || x.Company_Contact || clientName || 'N/A',
    contactPersonEmail: email,
    contactNumber: Number(phoneDigits) || 0,
    source: 'Direct',
    uniqueTicketId: uid,
  });

  try {
    await ticket.save({ validateBeforeSave: false });
    return 'added';
  } catch (e) {
    if (e.code === 11000) return 'skipped';
    throw e;
  }
}

async function syncExternalTickets() {
  if (!BASE_URL || !TOKEN || !COMPANY) {
    console.error('External sync: missing .env values');
    return;
  }
  if (mongoose.connection.readyState !== 1) return;

  let state;
  try {
    state = await acquireLock();
  } catch (e) {
    console.error('External sync lock error:', e.message);
    return;
  }
  if (!state) return;

  let added = 0, fetched = 0;
  try {
    let lastId = Number(state.lastId) || START_ID;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await fetchPage(lastId);
      const list = data.tickets || [];
      if (!list.length) break;
      fetched += list.length;

      for (const t of list) {
        try {
          const r = await importOne(t);
          if (r === 'added') added++;
        } catch (e) {
          console.error(`External ticket ${getId(t)} failed:`, e.message);
          throw e;   // position not saved, next run retries
        }
      }

      const maxId = Math.max(...list.map(getId).filter(Number.isFinite), 0);
      const newLast = Number(data.last_id ?? maxId);
      if (!(newLast > lastId)) break;
      lastId = newLast;
      await saveLastId(lastId);

      if (list.length < PAGE_SIZE) break;
    }

    if (added > 0) {
      console.log(`External sync: fetched ${fetched}, added ${added}`);
    }
  } catch (e) {
    console.error('External sync error:', e.message);
  } finally {
    try { await releaseLock(); } catch (_) {}
  }
}

module.exports = { syncExternalTickets };