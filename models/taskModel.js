const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const taskSchema = new Schema({

  name: {
    type: String, 
    required: [true, 'Task name is required'],
    unique: [true, 'A task with this name already exists'],
    trim: true,
    maxlength: [2000, 'Task name cannot exceed 2000 characters'],
  },
  company:{
    type:mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },

},{
  timestamps: true,
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
