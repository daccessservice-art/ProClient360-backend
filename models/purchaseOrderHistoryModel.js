const mongoose = require('mongoose');

const purchaseOrderHistorySchema = new mongoose.Schema({
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true,
  },
  updateType: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'ITEM_ADD', 'ITEM_REMOVE', 'ITEM_UPDATE'],
  },
  description: {
    type: String,
    required: true,
  },
  changes: {
    type: Object,
    default: {},
  },
  previousValues: {
    type: Object,
    default: {},
  },
  newValues: {
    type: Object,
    default: {},
  },
}, {
  timestamps: true,
});

const PurchaseOrderHistory = mongoose.model('PurchaseOrderHistory', purchaseOrderHistorySchema);

module.exports = PurchaseOrderHistory;