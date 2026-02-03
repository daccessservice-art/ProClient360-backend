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
  // New field to track call history by day and attempt
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
  // NEW FIELD for auto-marking
  autoMarkedDate: {
    type: Date,
    default: null
  },
  // NEW FIELD to track first call date
  firstCallDate: {
    type: Date,
    default: null
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