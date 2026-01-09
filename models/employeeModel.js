const mongoose = require('mongoose');


const employeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Employee name is required'],
    trim: true,
    maxlength: [100, 'Employee name cannot exceed 100 characters'],
  },
  department:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required:[true, 'Department is required'],
  },
  company:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Company',
    required:true
  },
  mobileNo: {
    type: String,
    required: [true, 'Mobile number is required'],
    unique: [true, 'An employee with this mobile number already exists'],
    trim: true,
    maxlength: [10, 'Mobile number cannot exceed 10 digits'],
    match: [/^\d{10}$/, 'Please enter a valid 10 digit mobile number'],
  },
  hourlyRate: {
    type: Number,
    required: [true, 'Hourly rate is required'],
    min: [0, 'Hourly rate cannot be less than 0'],
  },
  designation: {
    type: mongoose.Schema.Types.ObjectId,
    ref:'Designation',
    required: [true, 'Designation is required'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: [true, 'An employee with this email already exists'],
    trim:true,
    match: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
},
  password: {
    type: String,
    required: true,
  },
  gender:{
    type: String,
    required: [true, 'Gender is required'],
    enum:{
      values: ["male","female", "other"],
      message: 'Gender must be either male, female, or other'
    }
  },
  profilePic:{
    type: String,
    default:"",
  },
  fcmToken:{
    type: String,
    default:"",
  },
  performance: [
    {
      year: {
        type: Number,
        default: () => new Date().getFullYear() 
      },
      month: {
        type: Number,
        default: () => new Date().getMonth() + 1 
      },
      performance: {
        type: Number,
        default: 50 
      }
    }
  ],
  newUser: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});


const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;

