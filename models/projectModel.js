const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  custId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  },
  name:{
    type:String,
    required:[true, 'Project name is required'],
    maxlength: [1000, 'Project name cannot exceed 50 characters'],
  },
  company:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Company'
  },
  purchaseOrderNo: {
    type: String,
    required: [true, 'Purchase order number is required'],
    unique: [true, 'A project with this purchase order number already exists'],
    trim: true,
    maxlength: 200,
  },
  purchaseOrderDate: {
    type: Date,
    required: [true, 'Purchase order date is required'],
    default: Date.now(),
  },
  purchaseOrderValue: {
    type: Number,
    required: [true, 'Purchase order value is required'],
    min: [0, 'Purchase order value cannot be less than 0'],
  },
  category: {
    type:String,
    enum: [
      'CCTV System',
      'TA System',
      'Hajeri',
      'SmartFace',
      'ZKBioSecurity',
      'Access Control System',
      'Turnkey Project',
      'Alleviz',
      'CafeLive',
      'WorksJoy',
      'WorksJoy Blu',
      'Fire Alarm System',
      'Fire Hydrant System',
      'IDS',
      'AI Face Machines',
      'Entrance Automation',
      'Guard Tour System',
      'Home Automation',
      'IP PA and Communication System',
      'CRM',
      'KMS',
      'VMS',
      'PMS',
      'Boom Barrier System', 
      'Tripod System',
      'Flap Barrier System',
      'EPBX System',
      'CMS',  
      'Lift Eliviter System',
      'AV6',
      'Walky Talky System',
      'Device Management System'  
    ],
    required: [true, 'Category is required'],
  },
  Address:{
    add:{
      type:String,
      maxlength: [500, 'Address cannot exceed 200 characters'],
    },
    city:{
        type:String,
        maxLength: [50, 'City cannot exceed 50 characters'],
    },
    state:{
        type:String,
        maxLength: [50, 'State cannot exceed 50 characters'],
    },
    country:{
        type:String,
        maxLength: [50, 'Country cannot exceed 50 characters'],
    },
    pincode:{
        type:Number,
        maxLength: [6, 'Pincode cannot exceed 6 digits'],
    },
  },
  retention: {
    type: Number,
    min: [0, 'Retention Percentage cannot be less than 0'],
    max: [100, 'Retention Percentage cannot exceed 100'],
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
  },
  advancePay: {
    type: Number,
    required: [true, 'Advance payment percentage is required'],
    min: [0, 'Advance payment percentage cannot be less than 0'], 
    max: [100, 'Advance payment percentage cannot exceed 100'], 
  },
  payAgainstDelivery: {
    type: Number,
    required: [true, 'Payment against delivery percentage is required'],
    min: [0, 'Payment against delivery percentage cannot be less  than 0'], 
    max: [100, 'Payment against delivery percentage cannot exceed 100'], 
  },
  payAfterCompletion: {
    type: Number,
    required: [true, 'Payment after completion percentage is required'],
    min: [0, 'Payment after completion percentage cannot be less than 0'], 
    max: [100, 'Payment after completion percentage cannot exceed 100'],
  },
  remark: {
    type: String,
    maxlength: [200, 'Remark cannot exceed 200 characters'],
    lowercase: true,
  },
  projectStatus: {
    type: String,
    required: [true, 'Project status is required'],
    enum: ['Upcoming', 'Inprocess', 'Completed'], // Allowed values
    default:'Upcoming'
  },
  completeLevel: {
    type: Number,
    required: [true, 'Completion level is required'],
    min: [0, 'Completion level cannot be less than 0'], 
    max: [100, 'Completion level cannot exceed 100'],
    default: 0
  },
  POCopy: {
    type: String,
  },
  // New fields for project completion
  completionCertificate: {
    type: String,
  },
  warrantyCertificate: {
    type: String,
  },
  warrantyStartDate: {
    type: Date,
  },
  warrantyMonths: {
    type: Number,
    min: [0, 'Warranty months cannot be negative'],
  },
}, {
  timestamps: true, // This will automatically add createdAt and updatedAt fields
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;