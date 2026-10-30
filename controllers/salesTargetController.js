const mongoose = require('mongoose');
const SalesTarget = require('../models/salesTargetModel');
const Employee = require('../models/employeeModel');
const Project = require('../models/projectModel');
const {
  DEFAULT_INCENTIVE,
  round2,
  isSalesDesignationName,
  getFinancialYear,
  getFinancialYearRange,
  splitYearly,
  creditProjects,
  buildSummary,
} = require('../services/salesTargetCalc');

const companyOf = (user) => (user.company ? user.company : user._id);

const parseFy = (val) => {
  const n = parseInt(val, 10);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : getFinancialYear(new Date());
};

/**
 * POs inside the FY that count for these employees, with each employee's share.
 *  - POs they created → 100%, unless HR set a PO share rule for them
 *  - POs created by a colleague whose share rule includes them → their %
 * PO share rules are set by HR in Employee Master (🎯 popup) per FY,
 * and apply to ALL POs of that employee in that FY.
 * returns Map(employeeId → [project + creditedValue + sharePercent + splitWith])
 */
const fetchCreditedProjects = async (companyId, employeeIds, fy) => {
  const { start, end } = getFinancialYearRange(fy);
  const ids = employeeIds.map(String);

  // share rules for this FY that involve these employees (as creator or as receiver)
  const rules = await SalesTarget.find({
    company: companyId,
    financialYear: fy,
    'poShare.0': { $exists: true },
    $or: [{ employee: { $in: employeeIds } }, { 'poShare.employee': { $in: employeeIds } }],
  })
    .select('employee poShare')
    .populate('poShare.employee', 'name')
    .lean();

  // creators whose POs we must read = the employees + colleagues who share with them
  const creators = new Set(ids);
  rules.forEach((r) => creators.add(String(r.employee)));

  const projects = await Project.find({
    company: companyId,
    createdBy: { $in: [...creators] },
    purchaseOrderDate: { $gte: start, $lt: end },
  })
    .select('createdBy custId name purchaseOrderNo purchaseOrderDate purchaseOrderValue advancePay projectStatus category')
    .populate('custId', 'custName')
    .sort({ purchaseOrderDate: -1 })
    .lean();

  const ruleMap = new Map(rules.map((r) => [String(r.employee), r.poShare]));
  return creditProjects(projects, ruleMap, employeeIds);
};

const poRow = (p) => ({
  _id: p._id,
  customer: p.custId?.custName || 'N/A',
  product: p.name,
  category: p.category,
  poNumber: p.purchaseOrderNo,
  poDate: p.purchaseOrderDate,
  poValue: Number(p.purchaseOrderValue) || 0,
  // ✅ NEW: this employee's part of the PO
  sharePercent: p.sharePercent ?? 100,
  creditedValue: p.creditedValue ?? (Number(p.purchaseOrderValue) || 0),
  splitWith: p.splitWith || [],
  advancePay: Number(p.advancePay) || 0,
  status: p.projectStatus,
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-target?fy=2026&all=false&q=name
// HR view: every (sales) employee with target + achievement for the FY
// ─────────────────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const companyId = companyOf(req.user);
    const fy = parseFy(req.query.fy);
    const showAll = String(req.query.all) === 'true';
    const q = (req.query.q || '').trim();

    const empQuery = { company: companyId };
    if (q) empQuery.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    let employees = await Employee.find(empQuery, { password: 0 })
      .select('_id name email designation department target')
      .populate('designation', 'name')
      .populate('department', 'name')
      .sort({ name: 1 })
      .lean();

    const targets = await SalesTarget.find({ company: companyId, financialYear: fy }).lean();
    const targetMap = new Map(targets.map((t) => [String(t.employee), t]));

    // show sales designations + anyone who already has a target
    if (!showAll) {
      employees = employees.filter(
        (e) => isSalesDesignationName(e.designation?.name) || targetMap.has(String(e._id))
      );
    }

    const projByEmp = await fetchCreditedProjects(companyId, employees.map((e) => e._id), fy);

    const rows = employees.map((e) => {
      const t = targetMap.get(String(e._id)) || null;
      const s = buildSummary({ fy, targetDoc: t, projects: projByEmp.get(String(e._id)) || [] });
      return {
        employee: {
          _id: e._id,
          name: e.name,
          email: e.email,
          designation: e.designation?.name || '',
          department: e.department?.name || '',
        },
        targetId: t?._id || null,
        hasTarget: s.hasTarget,
        yearly: s.yearly,
        currentMonth: s.currentMonth,
        currentQuarter: s.currentQuarter,
        ytd: s.ytd,
        incentiveTotals: s.incentiveTotals,
        poCount: (projByEmp.get(String(e._id)) || []).length,
        updatedByName: t?.updatedByName || '',
        updatedAt: t?.updatedAt || null,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.target += r.yearly.target;
        acc.achieved += r.yearly.achieved;
        acc.incentive += r.incentiveTotals.total;
        return acc;
      },
      { target: 0, achieved: 0, incentive: 0 }
    );

    res.status(200).json({
      success: true,
      financialYear: fy,
      financialYearLabel: `FY ${fy}-${String(fy + 1).slice(-2)}`,
      rows,
      totals: {
        target: round2(totals.target),
        achieved: round2(totals.achieved),
        incentive: round2(totals.incentive),
        percent: totals.target > 0 ? round2((totals.achieved / totals.target) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('salesTarget.list error:', error);
    res.status(500).json({ success: false, error: 'Error fetching sales targets: ' + error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-target/employee/:id?fy=2026
// HR view of one employee: full target + monthly split + incentive rules + POs
// ─────────────────────────────────────────────────────────────────────────────
exports.getForEmployee = async (req, res) => {
  try {
    const companyId = companyOf(req.user);
    const fy = parseFy(req.query.fy);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid employee id' });
    }

    const employee = await Employee.findOne({ _id: id, company: companyId })
      .select('_id name email designation')
      .populate('designation', 'name')
      .lean();
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    const targetDoc = await SalesTarget.findOne({ employee: id, financialYear: fy })
      .populate('poShare.employee', 'name')
      .lean();
    const credited = await fetchCreditedProjects(companyId, [employee._id], fy);
    const projects = credited.get(String(employee._id)) || [];
    const summary = buildSummary({ fy, targetDoc, projects });

    res.status(200).json({
      success: true,
      employee: { _id: employee._id, name: employee.name, email: employee.email, designation: employee.designation?.name || '' },
      target: targetDoc
        ? {
            _id: targetDoc._id,
            monthlyTargets: targetDoc.monthlyTargets,
            yearlyTarget: targetDoc.yearlyTarget,
            incentive: { ...DEFAULT_INCENTIVE, ...(targetDoc.incentive || {}) },
            remark: targetDoc.remark,
            poShare: (targetDoc.poShare || []).map((r) => ({
              employee: r.employee?._id || r.employee,
              name: r.employee?.name || '',
              percent: r.percent,
            })),
            updatedByName: targetDoc.updatedByName,
            updatedAt: targetDoc.updatedAt,
            history: (targetDoc.history || []).slice(-10).reverse(),
          }
        : null,
      summary,
      purchaseOrders: projects.map(poRow),
    });
  } catch (error) {
    console.error('salesTarget.getForEmployee error:', error);
    res.status(500).json({ success: false, error: 'Error fetching target: ' + error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/sales-target/employee/:id
// body: { financialYear, yearlyTarget? , monthlyTargets?[12], incentive?, remark? }
//  - only yearlyTarget  → split equally into 12 months
//  - monthlyTargets     → used as-is (yearly = sum)
// ─────────────────────────────────────────────────────────────────────────────
exports.upsertForEmployee = async (req, res) => {
  try {
    const user = req.user;
    const companyId = companyOf(user);
    const { id } = req.params;
    const fy = parseFy(req.body.financialYear);
    const { yearlyTarget, monthlyTargets, incentive, remark, poShare } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid employee id' });
    }

    const employee = await Employee.findOne({ _id: id, company: companyId }).select('_id name');
    if (!employee) return res.status(404).json({ success: false, error: 'Employee not found' });

    // ── resolve the 12 monthly targets ──
    let months;
    if (Array.isArray(monthlyTargets)) {
      if (monthlyTargets.length !== 12) {
        return res.status(400).json({ success: false, error: 'monthlyTargets must have 12 values (April to March)' });
      }
      months = monthlyTargets.map((v) => Number(v));
      if (months.some((v) => !Number.isFinite(v) || v < 0)) {
        return res.status(400).json({ success: false, error: 'Monthly targets must be numbers of 0 or more' });
      }
      months = months.map(round2);
    } else if (yearlyTarget !== undefined && yearlyTarget !== null && yearlyTarget !== '') {
      const y = Number(yearlyTarget);
      if (!Number.isFinite(y) || y < 0) {
        return res.status(400).json({ success: false, error: 'Yearly target must be a number of 0 or more' });
      }
      months = splitYearly(y);
    } else {
      return res.status(400).json({ success: false, error: 'Send yearlyTarget or monthlyTargets' });
    }

    // ── incentive rules (percent values) ──
    const inc = { ...DEFAULT_INCENTIVE };
    if (incentive && typeof incentive === 'object') {
      ['monthlyPoRate', 'quarterlyRate', 'yearlyRate', 'quarterlyThreshold', 'yearlyThreshold'].forEach((k) => {
        if (incentive[k] !== undefined && incentive[k] !== '') {
          const v = Number(incentive[k]);
          if (Number.isFinite(v) && v >= 0 && v <= 100) inc[k] = v;
        }
      });
      if (incentive.monthlyRequireAdvance !== undefined) inc.monthlyRequireAdvance = Boolean(incentive.monthlyRequireAdvance);
      if (['target', 'achieved'].includes(incentive.basis)) inc.basis = incentive.basis;
    }

    // ── PO share rule (optional): all POs of this employee in this FY ──
    //    [{ employee, percent }] incl. this employee; empty = 100% own
    let shareRows;
    if (poShare !== undefined) {
      if (!Array.isArray(poShare)) {
        return res.status(400).json({ success: false, error: 'poShare must be a list' });
      }
      shareRows = [];
      for (const r of poShare) {
        const empId = String(r.employee || '');
        const percent = round2(r.percent);
        if (!mongoose.Types.ObjectId.isValid(empId)) {
          return res.status(400).json({ success: false, error: 'Select an employee in every share row' });
        }
        if (!(percent > 0) || percent > 100) {
          return res.status(400).json({ success: false, error: 'Each PO share must be more than 0% and up to 100%' });
        }
        shareRows.push({ employee: empId, percent });
      }
      if (shareRows.length > 10) {
        return res.status(400).json({ success: false, error: 'Maximum 10 employees in a PO share' });
      }
      // only one row and it is this employee at 100% → no sharing
      if (shareRows.length === 1 && shareRows[0].employee === String(id)) shareRows = [];

      if (shareRows.length > 0) {
        const shareIds = shareRows.map((r) => r.employee);
        if (new Set(shareIds).size !== shareIds.length) {
          return res.status(400).json({ success: false, error: 'The same employee is added twice in PO share' });
        }
        const total = round2(shareRows.reduce((s, r) => s + r.percent, 0));
        if (Math.abs(total - 100) >= 0.01) {
          return res.status(400).json({ success: false, error: `PO share must add up to 100% (now ${total}%)` });
        }
        const found = await Employee.countDocuments({ _id: { $in: shareIds }, company: companyId });
        if (found !== shareIds.length) {
          return res.status(400).json({ success: false, error: 'PO share employee not found in your company' });
        }
      }
    }

    let doc = await SalesTarget.findOne({ employee: id, financialYear: fy });
    if (doc) {
      doc.history.push({
        yearlyTarget: doc.yearlyTarget,
        monthlyTargets: doc.monthlyTargets,
        incentive: doc.incentive,
        poShare: doc.poShare,
        changedBy: doc.updatedBy,
        changedByName: doc.updatedByName,
        changedAt: doc.updatedAt,
      });
      if (doc.history.length > 50) doc.history = doc.history.slice(-50);
    } else {
      doc = new SalesTarget({ company: companyId, employee: id, financialYear: fy });
    }

    doc.monthlyTargets = months;
    doc.incentive = inc;
    if (remark !== undefined) doc.remark = String(remark).slice(0, 500);
    if (shareRows !== undefined) doc.poShare = shareRows;
    doc.updatedBy = user._id;
    doc.updatedByName = user.name || 'HR';
    await doc.save();

    // keep the old Employee.target field in sync for the current FY,
    // so every existing screen that reads employee.target keeps working
    if (fy === getFinancialYear(new Date())) {
      await Employee.updateOne({ _id: id }, { $set: { target: doc.yearlyTarget } });
    }

    res.status(200).json({
      success: true,
      message: `Target saved for ${employee.name} (FY ${fy}-${String(fy + 1).slice(-2)})`,
      target: doc,
    });
  } catch (error) {
    console.error('salesTarget.upsert error:', error);
    res.status(500).json({ success: false, error: 'Error saving target: ' + error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-target/my?fy=2026
// Logged-in sales employee → own dashboard data
// ─────────────────────────────────────────────────────────────────────────────
exports.my = async (req, res) => {
  try {
    const user = req.user;
    if (!user.company) {
      return res.status(200).json({ success: true, summary: null, purchaseOrders: [] });
    }
    const fy = parseFy(req.query.fy);
    const targetDoc = await SalesTarget.findOne({ employee: user._id, financialYear: fy }).lean();
    const credited = await fetchCreditedProjects(user.company, [user._id], fy);
    const projects = credited.get(String(user._id)) || [];
    const summary = buildSummary({ fy, targetDoc, projects });

    res.status(200).json({
      success: true,
      summary,
      purchaseOrders: projects.map(poRow),
    });
  } catch (error) {
    console.error('salesTarget.my error:', error);
    res.status(500).json({ success: false, error: 'Error fetching your target: ' + error.message });
  }
};