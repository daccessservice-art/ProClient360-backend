const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// Sales Target (one document per employee per Financial Year, April → March)
// financialYear = start year. 2026 means FY 2026-27 (01 Apr 2026 → 31 Mar 2027)
// monthlyTargets[0] = April ... monthlyTargets[11] = March
// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ✅ PO sharing rule: every PO created by this employee in this FY is shared
//    e.g. [{ employee: Priti, percent: 80 }, { employee: Pooja, percent: 20 }]
//    Empty = 100% to the employee who created the PO (normal).
const poShareSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    percent: { type: Number, required: true, min: 0.01, max: 100 },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    yearlyTarget: Number,
    monthlyTargets: [Number],
    incentive: mongoose.Schema.Types.Mixed,
    poShare: mongoose.Schema.Types.Mixed,
    changedBy: { type: mongoose.Schema.Types.ObjectId },
    changedByName: String,
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const salesTargetSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    financialYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },
    monthlyTargets: {
      type: [Number],
      default: () => Array(12).fill(0),
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length === 12 &&
          arr.every((n) => typeof n === 'number' && n >= 0),
        message: 'monthlyTargets must contain 12 non-negative numbers (Apr to Mar)',
      },
    },
    // auto-calculated = sum of monthlyTargets
    yearlyTarget: {
      type: Number,
      default: 0,
      min: 0,
    },
    // All rates are in PERCENT (0.1 means 0.1%)
    incentive: {
      monthlyPoRate: { type: Number, default: 0.1, min: 0, max: 100 },
      monthlyRequireAdvance: { type: Boolean, default: true },
      quarterlyRate: { type: Number, default: 0.1, min: 0, max: 100 },
      quarterlyThreshold: { type: Number, default: 80, min: 0, max: 100 },
      yearlyRate: { type: Number, default: 0.1, min: 0, max: 100 },
      yearlyThreshold: { type: Number, default: 100, min: 0, max: 100 },
      // 'target'   → incentive = rate × target amount   (as in your Excel)
      // 'achieved' → incentive = rate × achieved PO amount
      basis: { type: String, enum: ['target', 'achieved'], default: 'target' },
    },
    poShare: {
      type: [poShareSchema],
      default: [],
      validate: {
        validator: (arr) => {
          if (!arr || arr.length === 0) return true;
          const ids = arr.map((r) => String(r.employee));
          if (new Set(ids).size !== ids.length) return false;
          const total = arr.reduce((s, r) => s + (Number(r.percent) || 0), 0);
          return Math.abs(total - 100) < 0.01;
        },
        message: 'PO share must be for different employees and add up to exactly 100%',
      },
    },
    remark: {
      type: String,
      maxlength: 500,
      default: '',
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId },
    updatedByName: { type: String, default: '' },
    history: [historySchema],
  },
  { timestamps: true }
);

salesTargetSchema.index({ employee: 1, financialYear: 1 }, { unique: true });

salesTargetSchema.pre('validate', function (next) {
  this.yearlyTarget = round2((this.monthlyTargets || []).reduce((a, b) => a + (Number(b) || 0), 0));
  next();
});

module.exports = mongoose.model('SalesTarget', salesTargetSchema);