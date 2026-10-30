// ─────────────────────────────────────────────────────────────────────────────
// Sales target / achievement / incentive calculations
// Financial Year = April → March. Index 0 = April ... 11 = March.
// "Achieved" = sum of Project.purchaseOrderValue (without GST) of projects the
// employee created (createdBy), bucketed by purchaseOrderDate (IST).
// ─────────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const QUARTER_LABELS = ['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)'];

const SALES_KEYWORDS = ['sales', 'marketing', 'amc', 'bde', 'bdm', 'tender'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const isSalesDesignationName = (name = '') => {
  const d = String(name).toLowerCase();
  return SALES_KEYWORDS.some((k) => d.includes(k));
};

// FY start year for a date (IST). Oct 2026 → 2026, Feb 2027 → 2026
const getFinancialYear = (date = new Date()) => {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const m = ist.getUTCMonth();
  const y = ist.getUTCFullYear();
  return m >= 3 ? y : y - 1;
};

// [start, end) of the FY as real Date objects (IST midnight boundaries)
const getFinancialYearRange = (fy) => {
  const start = new Date(Date.UTC(fy, 3, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(fy + 1, 3, 1) - IST_OFFSET_MS);
  return { start, end };
};

// 0..11 (Apr..Mar) for a date, in IST
const getFyMonthIndex = (date) => {
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return (ist.getUTCMonth() + 9) % 12;
};

// which FY month is "now" (−1 if FY is in the future, 12 if FY is over)
const getCurrentFyMonthIndex = (fy) => {
  const currentFy = getFinancialYear(new Date());
  if (fy < currentFy) return 12;
  if (fy > currentFy) return -1;
  return getFyMonthIndex(new Date());
};

// Split a yearly target into 12 equal months (last month absorbs rounding)
const splitYearly = (yearly) => {
  const total = round2(yearly);
  const each = Math.floor((total / 12) * 100) / 100;
  const arr = Array(12).fill(each);
  arr[11] = round2(total - each * 11);
  return arr;
};

const DEFAULT_INCENTIVE = {
  monthlyPoRate: 0.1,
  monthlyRequireAdvance: true,
  quarterlyRate: 0.1,
  quarterlyThreshold: 80,
  yearlyRate: 0.1,
  yearlyThreshold: 100,
  basis: 'target',
};

/**
 * Split one PO value into exact rupee-paise shares.
 * The last share takes the rounding difference, so shares always add up
 * to exactly the PO value (₹10,00,001 at 80/20 → 8,00,000.80 + 2,00,000.20).
 */
const splitAmount = (value, percents) => {
  const total = round2(value);
  const parts = percents.map((p) => round2((total * (Number(p) || 0)) / 100));
  if (parts.length > 0) {
    const others = parts.slice(0, -1).reduce((s, n) => s + n, 0);
    parts[parts.length - 1] = round2(total - others);
  }
  return parts;
};

/**
 * Give each employee their credited share of every PO.
 *  - Creator has a PO share rule (set by HR in Employee Master)
 *        → each listed employee gets value × percent / 100
 *  - No rule → createdBy gets 100% (old behaviour)
 * projects : lean Project docs
 * splitMap : Map(creatorEmployeeId → [{ employee:{_id,name}|id, percent }])
 * empIds   : employees we want results for
 * returns Map(employeeId → [project + { creditedValue, sharePercent, splitWith }])
 */
const creditProjects = (projects = [], splitMap = new Map(), empIds = []) => {
  const wanted = new Set(empIds.map(String));
  const out = new Map();
  const push = (empId, row) => {
    if (!wanted.has(empId)) return;
    if (!out.has(empId)) out.set(empId, []);
    out.get(empId).push(row);
  };

  projects.forEach((p) => {
    const value = Number(p.purchaseOrderValue) || 0;
    const split = p.createdBy ? splitMap.get(String(p.createdBy?._id || p.createdBy)) : null;

    if (Array.isArray(split) && split.length > 0) {
      const amounts = splitAmount(value, split.map((s) => s.percent));
      const people = split.map((s, idx) => ({
        id: String(s.employee?._id || s.employee),
        name: s.employee?.name || '',
        percent: Number(s.percent) || 0,
        amount: amounts[idx],
      }));
      people.forEach((person) => {
        push(person.id, {
          ...p,
          sharePercent: person.percent,
          creditedValue: person.amount,
          splitWith: people
            .filter((o) => o.id !== person.id)
            .map((o) => ({ name: o.name, percent: o.percent, amount: o.amount })),
        });
      });
    } else if (p.createdBy) {
      push(String(p.createdBy?._id || p.createdBy), {
        ...p,
        sharePercent: 100,
        creditedValue: round2(value),
        splitWith: [],
      });
    }
  });

  return out;
};

/**
 * Build monthly achieved arrays from a list of projects
 * Uses creditedValue (employee's share) when present, else full PO value.
 * returns { achieved[12], achievedWithAdvance[12], poCount[12] }
 */
const bucketProjects = (projects = []) => {
  const achieved = Array(12).fill(0);
  const achievedWithAdvance = Array(12).fill(0);
  const poCount = Array(12).fill(0);

  projects.forEach((p) => {
    if (!p.purchaseOrderDate) return;
    const i = getFyMonthIndex(p.purchaseOrderDate);
    const val =
      p.creditedValue !== undefined && p.creditedValue !== null
        ? Number(p.creditedValue) || 0
        : Number(p.purchaseOrderValue) || 0;
    achieved[i] += val;
    poCount[i] += 1;
    if ((Number(p.advancePay) || 0) > 0) achievedWithAdvance[i] += val;
  });

  return {
    achieved: achieved.map(round2),
    achievedWithAdvance: achievedWithAdvance.map(round2),
    poCount,
  };
};

const pct = (a, t) => (t > 0 ? round2((a / t) * 100) : 0);

/**
 * Full summary for one employee for one FY.
 * targetDoc may be null (no target set yet).
 */
const buildSummary = ({ fy, targetDoc, projects }) => {
  const monthlyTargets = targetDoc?.monthlyTargets?.length === 12
    ? targetDoc.monthlyTargets.map(Number)
    : Array(12).fill(0);
  const incentive = { ...DEFAULT_INCENTIVE, ...(targetDoc?.incentive?.toObject ? targetDoc.incentive.toObject() : targetDoc?.incentive || {}) };

  const { achieved, achievedWithAdvance, poCount } = bucketProjects(projects);
  const nowIdx = getCurrentFyMonthIndex(fy);

  // ── Monthly ──
  const months = MONTH_LABELS.map((label, i) => {
    const target = round2(monthlyTargets[i]);
    const ach = achieved[i];
    const eligibleAch = incentive.monthlyRequireAdvance ? achievedWithAdvance[i] : ach;
    const met = target > 0 && eligibleAch >= target;
    const base = incentive.basis === 'achieved' ? eligibleAch : target;
    return {
      index: i,
      label,
      year: i <= 8 ? fy : fy + 1,
      target,
      achieved: ach,
      achievedWithAdvance: achievedWithAdvance[i],
      poCount: poCount[i],
      percent: pct(ach, target),
      incentiveEligible: met,
      incentive: met ? round2((base * incentive.monthlyPoRate) / 100) : 0,
      status: i < nowIdx ? 'past' : i === nowIdx ? 'current' : 'upcoming',
    };
  });

  // ── Quarterly ──
  const quarters = QUARTER_LABELS.map((label, q) => {
    const slice = months.slice(q * 3, q * 3 + 3);
    const target = round2(slice.reduce((s, m) => s + m.target, 0));
    const ach = round2(slice.reduce((s, m) => s + m.achieved, 0));
    const need = round2((target * incentive.quarterlyThreshold) / 100);
    const met = target > 0 && ach >= need;
    const base = incentive.basis === 'achieved' ? ach : target;
    return {
      index: q,
      label,
      target,
      achieved: ach,
      percent: pct(ach, target),
      thresholdAmount: need,
      incentiveEligible: met,
      incentive: met ? round2((base * incentive.quarterlyRate) / 100) : 0,
    };
  });

  // ── Yearly ──
  const yearlyTarget = round2(monthlyTargets.reduce((s, n) => s + n, 0));
  const yearlyAchieved = round2(achieved.reduce((s, n) => s + n, 0));
  const yearlyNeed = round2((yearlyTarget * incentive.yearlyThreshold) / 100);
  const yearlyMet = yearlyTarget > 0 && yearlyAchieved >= yearlyNeed;
  const yearlyBase = incentive.basis === 'achieved' ? yearlyAchieved : yearlyTarget;

  const yearly = {
    target: yearlyTarget,
    achieved: yearlyAchieved,
    percent: pct(yearlyAchieved, yearlyTarget),
    thresholdAmount: yearlyNeed,
    remaining: round2(Math.max(yearlyTarget - yearlyAchieved, 0)),
    incentiveEligible: yearlyMet,
    incentive: yearlyMet ? round2((yearlyBase * incentive.yearlyRate) / 100) : 0,
  };

  // ── Current month / quarter (for KPI cards) ──
  const curIdx = Math.min(Math.max(nowIdx, 0), 11);
  const currentMonth = months[curIdx];
  const currentQuarter = quarters[Math.floor(curIdx / 3)];

  // ── Year-to-date (target till current month) ──
  const ytdTarget = round2(months.slice(0, curIdx + 1).reduce((s, m) => s + m.target, 0));
  const ytdAchieved = round2(months.slice(0, curIdx + 1).reduce((s, m) => s + m.achieved, 0));

  const incentiveTotals = {
    monthly: round2(months.reduce((s, m) => s + m.incentive, 0)),
    quarterly: round2(quarters.reduce((s, q) => s + q.incentive, 0)),
    yearly: yearly.incentive,
  };
  incentiveTotals.total = round2(incentiveTotals.monthly + incentiveTotals.quarterly + incentiveTotals.yearly);

  // max possible if every target is hit (with basis = target)
  const maxPossible = round2(
    (yearlyTarget * incentive.monthlyPoRate) / 100 +
    (yearlyTarget * incentive.quarterlyRate) / 100 +
    (yearlyTarget * incentive.yearlyRate) / 100
  );

  return {
    financialYear: fy,
    financialYearLabel: `FY ${fy}-${String(fy + 1).slice(-2)}`,
    hasTarget: yearlyTarget > 0,
    incentiveRules: incentive,
    months,
    quarters,
    yearly,
    currentMonth,
    currentQuarter,
    ytd: { target: ytdTarget, achieved: ytdAchieved, percent: pct(ytdAchieved, ytdTarget) },
    incentiveTotals,
    maxPossibleIncentive: maxPossible,
  };
};

module.exports = {
  MONTH_LABELS,
  QUARTER_LABELS,
  DEFAULT_INCENTIVE,
  round2,
  isSalesDesignationName,
  getFinancialYear,
  getFinancialYearRange,
  getFyMonthIndex,
  splitYearly,
  splitAmount,
  creditProjects,
  bucketProjects,
  buildSummary,
};