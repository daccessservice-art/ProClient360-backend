const ServiceReview = require('../models/serviceReviewModel');
const { Types } = require('mongoose');

// GET /api/serviceReview?engineerId=xxx
exports.showByEngineer = async (req, res) => {
  try {
    const user = req.user;
    const { engineerId } = req.query;

    if (!engineerId || !Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, error: 'Valid engineerId is required' });
    }

    const reviews = await ServiceReview.find({
      company:    user.company || user._id,
      engineerId: new Types.ObjectId(engineerId),
    }).sort({ year: -1, month: -1 });

    res.status(200).json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching reviews: ' + error.message });
  }
};

// POST /api/serviceReview  — create or overwrite (upsert)
exports.upsert = async (req, res) => {
  try {
    const user = req.user;
    const { engineerId, engineerName, month, year, ratings, remark, avgRating, completedCount } = req.body;

    if (!engineerId || !Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, error: 'Valid engineerId is required' });
    }

    const companyId = user.company || user._id;

    const review = await ServiceReview.findOneAndUpdate(
      { company: companyId, engineerId, month, year },
      {
        $set: {
          engineerName,
          ratings,
          remark:         remark || '',
          avgRating:      String(avgRating),
          completedCount: completedCount || 0,
          reviewedBy:     user._id,
          company:        companyId,
          engineerId,
          month,
          year,
        },
      },
      { upsert: true, new: true, runValidators: false }
    );

    res.status(200).json({ success: true, message: 'Review saved successfully', review });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error saving review: ' + error.message });
  }
};