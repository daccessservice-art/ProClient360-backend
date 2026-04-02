const HRReview = require('../models/hrReviewModel');
const { Types } = require('mongoose');

// GET /api/hrReview?engineerId=xxx  — fetch all reviews for one engineer
exports.showByEngineer = async (req, res) => {
  try {
    const user = req.user;
    const { engineerId } = req.query;

    if (!engineerId || !Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, error: 'Valid engineerId is required' });
    }

    const reviews = await HRReview.find({
      company:    user.company || user._id,
      engineerId: new Types.ObjectId(engineerId),
    }).sort({ year: -1, month: -1 });

    res.status(200).json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching HR reviews: ' + error.message });
  }
};

// POST /api/hrReview  — create or overwrite (upsert by month+year+engineer)
exports.upsert = async (req, res) => {
  try {
    const user = req.user;
    const { engineerId, engineerName, month, year, ratings, remark, avgRating } = req.body;

    if (!engineerId || !Types.ObjectId.isValid(engineerId)) {
      return res.status(400).json({ success: false, error: 'Valid engineerId is required' });
    }

    const companyId = user.company || user._id;

    const review = await HRReview.findOneAndUpdate(
      { company: companyId, engineerId, month, year },
      {
        $set: {
          engineerName,
          ratings,
          remark:     remark || '',
          avgRating:  String(avgRating),
          reviewedBy: user._id,
          company:    companyId,
          engineerId,
          month,
          year,
        },
      },
      { upsert: true, new: true, runValidators: false }
    );

    res.status(200).json({ success: true, message: 'HR Review saved successfully', review });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error saving HR review: ' + error.message });
  }
};

// GET /api/hrReview/all  — fetch all reviews for leaderboard calculation
// Returns: { success, reviews: [ { engineerId, engineerName, avgRating, month, year } ] }
exports.showAll = async (req, res) => {
  try {
    const user = req.user;
    const { month, year } = req.query;

    const query = { company: user.company || user._id };
    if (month !== undefined && month !== '') query.month = Number(month);
    if (year  !== undefined && year  !== '') query.year  = Number(year);

    const reviews = await HRReview.find(query).sort({ year: -1, month: -1 });

    res.status(200).json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching all HR reviews: ' + error.message });
  }
};