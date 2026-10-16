const mongoose = require('mongoose');

const externalTicketSchema = new mongoose.Schema(
  {
    externalId: { type: Number, required: true, unique: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    data: { type: mongoose.Schema.Types.Mixed },   // full raw ticket from the other API
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExternalTicket', externalTicketSchema);