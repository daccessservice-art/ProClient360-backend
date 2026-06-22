const mongoose = require('mongoose');

const customerRaiseTicketSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer reference is required'],
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  contacts: [{
    contactPersonName: {
      type: String,
      required: [true, 'Contact person name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    contactNumber: {
      type: String,
      trim: true,
      maxlength: [25, 'Phone number cannot exceed 25 characters'],
      default: '',
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [100, 'Email cannot exceed 100 characters'],
      default: '',
    },
    designation: {
      type: String,
      trim: true,
      maxlength: [100, 'Designation cannot exceed 100 characters'],
      default: '',
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, 'Location cannot exceed 200 characters'],
      default: '',
    },
  }],
}, {
  timestamps: true,
});

// Limit contacts to max 10
customerRaiseTicketSchema.path('contacts').validate(function (value) {
  return value && value.length <= 10;
}, 'Maximum 10 contacts allowed per ticket');

customerRaiseTicketSchema.index({ customer: 1 });
customerRaiseTicketSchema.index({ company: 1 });

const CustomerRaiseTicket = mongoose.model('CustomerRaiseTicket', customerRaiseTicketSchema);

module.exports = CustomerRaiseTicket;