const mongoose = require('mongoose');
const { Schema } = mongoose;

const leadSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  UNIQUE_QUERY_ID_IndiaMart: {
    type: String,
  },
  UNIQUE_ID_TRADEINDIA: {
    type: String,
  },
  SOURCE: {
    type: String,
    required: true,
    default: 'Direct'
  },
  STATUS: {
    type: String,
    required: true,
    enum: ['Pending', 'Ongoing', 'Lost', 'Won', 'HotLeads'],
    default: 'Pending'
  },
  callLeads: {
    type: String,
    enum: ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'],
    default: 'Warm Leads'
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
  },
  feasibility: {
    type: String,
    enum: ['feasible', 'not-feasible', 'call-unanswered', 'none'],
    default: 'none'
  },
  customerType: {
    type: String,
    enum: ['new', 'existing'],
    default: 'new'
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  
  // ✅ NEW FIELDS ADDED
  customerPriority: {
    type: String,
    enum: ['P1', 'P2', 'P3'],
    default: null
  },
  industryType: {
    type: String,
    enum: {
      values: [
        'IT & Software',
        'Manufacturing',
        'Construction & Infrastructure',
        'Healthcare',
        'Education',
        'Retail',
        'Banking & Finance',
        'Logistics & Supply Chain',
        'Hospitality',
        'Real Estate',
        'Government & Public Sector',
        'Energy & Utilities',
        'Telecom',
        'Pharmaceuticals',
        'Automotive',
        'Dealer',
        'Hotel',
        'Gym & Club',
        'Facility Services',
        'Labour Contractor',
        'Security Systems Dealer',
        'Other',
      ],
      message: '{VALUE} is not a valid industry type'
    },
    default: null
  },
  industryTypeOther: {
    type: String,
    trim: true,
    default: ''
  },
  // ✅ END NEW FIELDS

  remark: {
    type: String,
    trim: true,
    default: ''
  },
  rem: {
    type: String,
    trim: true,
    default: ''
  },
  assignedTime: {
    type: Date,
  },
  complated: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  step: {
    type: String,
    enum: [
      '1. Call Not Connect/ Callback',
      '2. Requirement Understanding',
      '3. Site Visit',
      '4. Online Demo',
      '5. Proof of Concept (POC)',
      '6. Documentation & Planning',
      '7. Quotation Submission',
      '8. Quotation Discussion',
      '9. Follow-Up Call',
      '10. Negotiation Call',
      '11. Negotiation Meetings',
      '12. Deal Status',
      '13. Won',
      '14. Lost',
      '15. Not Feasible'
    ],
  },
  quotation: {
    type: Number,
    default: 0,
  },
  nextFollowUpDate: {
    type: Date,
  },
  SENDER_NAME: {
    type: String,
  },
  SENDER_EMAIL: {
    type: String,
  },
  SENDER_MOBILE: {
    type: String,
  },
  SUBJECT: {
    type: String,
    trim: true,
  },
  SENDER_COMPANY: {
    type: String,
  },
  SENDER_ADDRESS: {
    type: String,
    trim: true,
  },
  SENDER_CITY: {
    type: String,
  },
  SENDER_STATE: {
    type: String,
  },
  SENDER_PINCODE: {
    type: String,
  },
  SENDER_COUNTRY_ISO: {
    type: String,
    trim: true,
  },
  QUERY_PRODUCT_NAME: {
    type: String,
    trim: true,
  },
  QUERY_MESSAGE: {
    type: String,
    trim: true,
  },
  QUERY_TIME: {
    type: Date,
    default: null,
  },
  callHistory: [{
    day: {
      type: Number,
      required: true
    },
    attempt: {
      type: Number,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['attempted', 'answered'],
      default: 'attempted'
    },
    remarks: {
      type: String,
      default: ''
    },
    attemptedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Employee'
    }
  }],
  autoMarkedDate: {
    type: Date,
    default: null
  },
  firstCallDate: {
    type: Date,
    default: null
  },
  callUnansweredMailSent: {
    type: Boolean,
    default: false,
  },
  callUnansweredMailSentAt: {
    type: Date,
    default: null,
  },

  projectSize: {
    type: String,
    enum: ['big', 'medium', 'small'],
    default: null
  },
  requirementType: {
    type: String,
    enum: ['survey', 'demo'],
    default: null
  },
  requirementMode: {
    type: String,
    enum: ['online', 'offline'],
    default: null
  },
  surveyNeeded: {
    type: String,
    enum: ['yes', 'no'],
    default: null
  },
  surveyDetails: {
    dateTime: { type: Date, default: null },
    communicatePerson: { type: String, default: '' },
    communicateEmail: { type: String, default: '' },
    communicateContact: { type: String, default: '' }
  },
  assignedSurveyEngineer: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },
  surveyEngineerAssignedAt: {
    type: Date,
    default: null
  },
  surveyEngineerAssignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'Employee',
    default: null
  },
  surveyReport: {
    status: {
      type: String,
      enum: ['pending', 'success', 'cancelled'],
      default: 'pending'
    },
    surveyDate: { type: Date, default: null },
    reportFile: { type: String, default: '' },
    drawingFile: { type: String, default: '' },
    boqFile: { type: String, default: '' },
    cancelReason: { type: String, default: '', maxLength: 20000 },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'Employee', default: null }
  },

  previousActions: [{
    _id: {
      type: Schema.Types.ObjectId,
      auto: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Ongoing', 'Lost', 'Won', 'HotLeads'],
      default: 'Pending'
    },
    step: {
      type: String,
      enum: [
        'Initial',
        '1. Call Not Connect/ Callback',
        '2. Requirement Understanding',
        '3. Site Visit',
        '4. Online Demo',
        '5. Proof of Concept (POC)',
        '6. Documentation & Planning',
        '7. Quotation Submission',
        '8. Quotation Discussion',
        '9. Follow-Up Call',
        '10. Negotiation Call',
        '11. Negotiation Meetings',
        '12. Deal Status',
        '13. Won',
        '14. Lost',
        '15. Not Feasible'
      ]
    },
    nextFollowUpDate: {
      type: Date
    },
    rem: {
      type: String,
      default: ''
    },
    completion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    quotation: {
      type: Number,
      default: 0
    },
    callLeads: {
      type: String,
      enum: ['Hot Leads', 'Warm Leads', 'Cold Leads', 'Invalid Leads'],
      default: 'Warm Leads'
    },
    actionBy: {
      name: {
        type: String,
        default: 'System'
      },
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'Employee'
      }
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

const Lead = mongoose.model('lead', leadSchema);
module.exports = Lead;