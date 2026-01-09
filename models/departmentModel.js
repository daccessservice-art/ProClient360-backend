const mongoose = require('mongoose');


const departmentSchema = new mongoose.Schema({
    company:{
        type: mongoose.Schema.Types.ObjectId,
        ref:'Company'
      },
    name:{
        type:String,
        required: [true, 'Department name is required'],
        maxlength: [50, 'Department name cannot exceed 50 characters'],
        trim: true,
        unique: [true, 'A department with this name already exists'],
    } 
},{
  timestamps: true,
});

const Department = mongoose.model('Department',departmentSchema);

module.exports= Department;