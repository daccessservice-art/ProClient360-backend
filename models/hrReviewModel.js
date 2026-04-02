const mongoose = require('mongoose');

const hrReviewSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    engineerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    engineerName: { type: String, required: true },
    month:        { type: Number, required: true },  // 0 = Jan … 11 = Dec
    year:         { type: Number, required: true },
    ratings: {
      type: Map,
      of: Number,
      default: {},
    },
    remark:    { type: String, default: '' },
    avgRating: { type: String, default: '0' },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
  },
  { timestamps: true }
);

// One HR review per company + engineer + month + year
hrReviewSchema.index(
  { company: 1, engineerId: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model('HRReview', hrReviewSchema);