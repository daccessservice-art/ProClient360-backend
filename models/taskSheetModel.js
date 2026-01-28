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
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee"
  },
  // NEW: Add priority field
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    required: [true, 'Priority is required']
  },
  taskStatus: {
    type: String,
    enum: ['stuck', 'inprocess', 'completed', 'upcomming'],
    default: 'upcomming'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    validate: {
      validator: function(value) {
        // Ensure start date is not before today
        return !value || value >= new Date(new Date().setHours(0, 0, 0, 0));
      },
      message: 'Start date cannot be before today'
    }
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: [
      {
        validator: function(value) {
          // Ensure end date is not before today
          return !value || value >= new Date(new Date().setHours(0, 0, 0, 0));
        },
        message: 'End date cannot be before today'
      },
      {
        validator: function(value) {
          // Ensure end date is after or equal to start date
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
    maxlength: 2000, // Updated from 200 to 2000
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
  timestamps: true // Add timestamps for createdAt and updatedAt
});

const TaskSheet = mongoose.model('TaskSheet', taskSheetSchema);

module.exports = TaskSheet;