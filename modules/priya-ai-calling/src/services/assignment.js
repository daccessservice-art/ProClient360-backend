// Assigns leads to sales / marketing / service employees.
// Rule: keep the existing active employee; otherwise prefer someone covering the lead's city/area,
// then round-robin (the person who got a lead longest ago goes next).
const { Employee } = require('../models');

const norm = (s) => String(s || '').trim().toLowerCase();

// PURE: pick one employee from a list (tested without a database)
function chooseEmployee(employees, { role = 'sales', city } = {}) {
  const pool = employees.filter((e) => e.active !== false && (!role || e.role === role));
  if (!pool.length) return null;
  const c = norm(city);
  const local = c ? pool.filter((e) => (e.areas || []).some((a) => c.includes(norm(a)) || norm(a).includes(c))) : [];
  const candidates = local.length ? local : pool;
  return [...candidates].sort((a, b) => (a.lastAssignedAt ? +new Date(a.lastAssignedAt) : 0) - (b.lastAssignedAt ? +new Date(b.lastAssignedAt) : 0))[0];
}

// Ensure the lead has an active employee; returns the employee (or null if nobody is available)
async function ensureAssigned(lead, { role = 'sales' } = {}) {
  if (lead.assignedTo) {
    const current = await Employee.findById(lead.assignedTo);
    if (current && current.active) return current;
  }
  // Try the requested role first; if nobody has that role, any active employee (e.g. one person doing sales + marketing)
  let pick = chooseEmployee(await Employee.find({ active: true, role }), { role, city: lead.city });
  if (!pick) pick = chooseEmployee(await Employee.find({ active: true }), { role: null, city: lead.city });
  if (!pick) return null;
  lead.assignedTo = pick._id;
  await lead.save();
  await Employee.updateOne({ _id: pick._id }, { lastAssignedAt: new Date() });
  return pick;
}

module.exports = { chooseEmployee, ensureAssigned };
