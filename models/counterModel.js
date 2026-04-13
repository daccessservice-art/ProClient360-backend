const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

const POCounter = mongoose.models.POCounter || mongoose.model('POCounter', counterSchema);

module.exports = POCounter;