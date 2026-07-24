const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSheetSchema = new Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  employees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'At least one employee is required for the task sheet']
  }],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  taskName: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: [true, 'Task name is required'],
  },
  subtaskName: {
    type: String,
    default: "",
    trim: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },

  // ─── TEAM LEAD LAYER ───────────────────────────────────────────────────────
  parentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskSheet',
    default: null
  },
  assignedByRole: {
    type: String,
    enum: ['manager', 'teamlead'],
    default: 'manager'
  },
  // ──────────────────────────────────────────────────────────────────────────

  // ─── TESTER / QA AGILE WORKFLOW ────────────────────────────────────────────
  // Manager can assign a tester up front. If left empty, the developer picks
  // the tester themselves when they submit their finished work for testing.
  assignedTester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },
  // 'none'         → no tester assigned yet, or dev hasn't submitted yet
  // 'pending_test' → developer submitted work, waiting for tester to start
  // 'testing'      → tester has started reviewing (progress may be partial)
  // 'bug_found'    → tester rejected — task returned to developer
  // 'passed'       → tester approved — task is genuinely complete
  qaStatus: {
    type: String,
    enum: ['none', 'pending_test', 'testing', 'bug_found', 'passed'],
    default: 'none'
  },
  // ── NEW: automatic testing timestamps — set by the server, never typed
  // in by hand. testStartDate is stamped the moment the developer submits
  // for testing (or the tester opens/starts it); testEndDate is stamped
  // the moment the tester gives a final Pass or Fail verdict. ──
  testStartDate: {
    type: Date,
    default: null
  },
  testEndDate: {
    type: Date,
    default: null
  },
  // ── NEW: tester's own in-progress completion percentage (0-100),
  // separate from the developer's taskLevel — e.g. "I've tested 90% of
  // this so far." Reset to 0 each time a new testing round starts. ──
  testProgress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  // Every time the tester rejects the work, a bug report is appended here.
  bugHistory: [{
    remark: { type: String, trim: true, maxlength: 1000 },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    reportedAt: { type: Date, default: Date.now }
  }],
  // How many times this task has bounced back from the tester.
  testCycles: {
    type: Number,
    default: 0
  },
  // ──────────────────────────────────────────────────────────────────────────

  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    required: [true, 'Priority is required']
  },
  taskStatus: {
    type: String,
    enum: ['stuck', 'inprocess', 'completed', 'upcoming'],
    default: 'upcoming'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: [
      {
        validator: function (value) {
          if (!value || !this.startDate) return true;
          return value >= this.startDate;
        },
        message: 'End date must be after or equal to start date'
      }
    ]
  },
  actualEndDate: {
    type: Date,
  },
  remark: {
    type: String,
    maxlength: [2000, 'Remark cannot exceed 2000 characters'],
    lowercase: true,
  },
  taskLevel: {
    type: Number,
    min: [0, 'Task level cannot be less than 0'],
    max: [100, 'Task level cannot exceed 100'],
    default: 0,
  },
  workCompletionPhoto: {
    type: String
  }
}, {
  timestamps: true
});

const TaskSheet = mongoose.model('TaskSheet', taskSheetSchema);

module.exports = TaskSheet;