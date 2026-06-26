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

  // ─── NEW FIELDS FOR TEAM LEAD LAYER ───────────────────────────────────────
  // If this task was created by a Team Lead as a sub-assignment,
  // parentTaskId points to the original Manager-assigned TaskSheet.
  parentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaskSheet',
    default: null
  },
  // 'manager' = assigned directly by Manager
  // 'teamlead' = assigned by Team Lead (sub-task under a parent)
  assignedByRole: {
    type: String,
    enum: ['manager', 'teamlead'],
    default: 'manager'
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