const mongoose = require('mongoose');
const Schema = mongoose.Schema;



const taskSheetSchema = new Schema({
  project:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  employees:[ {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: [true, 'At least one employee is required for the task sheet']
  }],
  company:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Company'
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
  taskStatus: {
    type: String,
    enum: ['stuck','inprocess', 'completed', 'upcomming'],
    default: 'upcomming'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],

},
endDate: {
  type: Date,
  validate: {
      validator: function (value) {
          // Skip validation if endDate is null (ongoing without a set end)
          if (!value) return true;

          // Ensure that the startDate is available in the context
          const startDate = this.startDate; // Access startDate from the document context

          return value instanceof Date && !isNaN(value) && value >= startDate;
      },
      message: 'End date must be a valid date and after start date',
  },
},
  actualEndDate:{
    type: Date,
  },
  remark: {
    type: String,
    maxlength: 200,
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
});

const TaskSheet = mongoose.model('TaskSheet', taskSheetSchema);

module.exports = TaskSheet; 