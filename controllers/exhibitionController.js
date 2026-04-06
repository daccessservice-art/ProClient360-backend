// controllers/exhibitionController.js
const Exhibition = require('../models/exhibitionModel');
const ExhibitionVisit = require('../models/exhibitionVisitModel');
const { sendVisitThankYouEmail } = require('../mailsService/visitThankYouMailService');

// ─── EXHIBITION MASTER CONTROLLERS ───────────────────────────────────────────

exports.showAllExhibitions = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;
    const { q } = req.query;

    let query = { company: user.company || user._id };

    if (q && q.trim() !== '' && q.trim().toLowerCase() !== 'null' && q.trim().toLowerCase() !== 'undefined') {
      const searchRegex = new RegExp(q, 'i');
      skip = 0;
      page = 1;
      query = {
        company: user.company || user._id,
        $or: [
          { exhibitionName: { $regex: searchRegex } },
          { venue: { $regex: searchRegex } },
          { city: { $regex: searchRegex } },
          { country: { $regex: searchRegex } },
          { targetAddress: { $regex: searchRegex } },
          { status: { $regex: searchRegex } },
        ],
      };
    }

    const exhibitions = await Exhibition.find(query)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('exhibitionOwner', 'name mobile designation') // ✅ populate owner
      .sort({ createdAt: -1 })
      .lean();

    const totalExhibitions = await Exhibition.countDocuments(query);
    const totalPages = Math.ceil(totalExhibitions / limit);

    res.status(200).json({
      success: true,
      exhibitions,
      pagination: {
        currentPage: page,
        totalPages,
        totalExhibitions,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching exhibitions: ' + error.message });
  }
};

exports.getExhibitionById = async (req, res) => {
  try {
    const exhibition = await Exhibition.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('exhibitionOwner', 'name mobile designation');
    if (!exhibition) return res.status(404).json({ success: false, error: 'Exhibition not found' });
    res.status(200).json({ success: true, exhibition });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching exhibition: ' + error.message });
  }
};

exports.createExhibition = async (req, res) => {
  try {
    const user = req.user;
    const {
      exhibitionName, targetAddress, dateFrom, dateTo,
      venue, city, country, exhibitionFees, stallDesignationFees,
      status, exhibitionOwner,
    } = req.body;

    if (new Date(dateTo) < new Date(dateFrom)) {
      return res.status(400).json({ success: false, error: '"Date To" cannot be earlier than "Date From"' });
    }

    const newExhibition = new Exhibition({
      exhibitionName, targetAddress, dateFrom, dateTo,
      venue, city, country, exhibitionFees, stallDesignationFees,
      status: status || 'Upcoming',
      exhibitionOwner: exhibitionOwner || null, // ✅
      company: user.company || user._id,
      createdBy: user._id,
    });

    const saved = await newExhibition.save();

    const populated = await Exhibition.findById(saved._id)
      .populate('createdBy', 'name email')
      .populate('exhibitionOwner', 'name mobile designation');

    res.status(201).json({ success: true, message: 'Exhibition created successfully', exhibition: populated });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error creating exhibition: ' + error.message });
  }
};

exports.updateExhibition = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (updatedData.dateFrom && updatedData.dateTo) {
      if (new Date(updatedData.dateTo) < new Date(updatedData.dateFrom)) {
        return res.status(400).json({ success: false, error: '"Date To" cannot be earlier than "Date From"' });
      }
    }

    const exhibition = await Exhibition.findByIdAndUpdate(id, updatedData, {
      new: true, runValidators: true,
    })
      .populate('createdBy', 'name email')
      .populate('exhibitionOwner', 'name mobile designation');

    if (!exhibition) return res.status(404).json({ success: false, error: 'Exhibition not found' });

    res.status(200).json({ success: true, message: 'Exhibition updated successfully', exhibition });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error updating exhibition: ' + error.message });
  }
};

exports.deleteExhibition = async (req, res) => {
  try {
    const exhibition = await Exhibition.findById(req.params.id);
    if (!exhibition) return res.status(404).json({ success: false, error: 'Exhibition not found' });

    const visits = await ExhibitionVisit.countDocuments({ exhibition: req.params.id });
    if (visits > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete exhibition. It has ${visits} visit record(s) linked.`,
      });
    }

    await Exhibition.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Exhibition deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error deleting exhibition: ' + error.message });
  }
};

// ✅ Dropdown — only current & future exhibitions (dateTo >= today)
exports.getExhibitionsDropdown = async (req, res) => {
  try {
    const user = req.user;
    const { q } = req.query;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let query = {
      company: user.company || user._id,
      dateTo: { $gte: todayStart },
    };

    if (q && q.trim() !== '') {
      query.exhibitionName = { $regex: new RegExp(q, 'i') };
    }

    const exhibitions = await Exhibition.find(query)
      .select('exhibitionName city dateFrom dateTo status exhibitionOwner')
      .populate('exhibitionOwner', 'name mobile designation') // ✅
      .sort({ dateFrom: 1 })
      .limit(50)
      .lean();

    res.status(200).json({ success: true, exhibitions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching exhibitions: ' + error.message });
  }
};

// ─── EXHIBITION VISIT CONTROLLERS ─────────────────────────────────────────────

exports.showAllVisits = async (req, res) => {
  try {
    const user = req.user;
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let skip = (page - 1) * limit;
    const { q, exhibitionId } = req.query;

    let query = { company: user.company || user._id };
    if (exhibitionId) query.exhibition = exhibitionId;

    if (q && q.trim() !== '' && q.trim().toLowerCase() !== 'null') {
      const searchRegex = new RegExp(q, 'i');
      skip = 0;
      page = 1;
      query = {
        ...query,
        $or: [
          { customerName: { $regex: searchRegex } },
          { companyName: { $regex: searchRegex } },
          { mobile: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { location: { $regex: searchRegex } },
          { visitorDesignation: { $regex: searchRegex } },
          { leadsType: { $regex: searchRegex } },
          { product: { $regex: searchRegex } },
        ],
      };
    }

    const visits = await ExhibitionVisit.find(query)
      .skip(skip)
      .limit(limit)
      .select(
        'exhibition customerName companyName mobile email location followUpDate remark ' +
        'visitorDesignation leadsType product createdBy createdAt'
      )
      .populate({
        path: 'exhibition',
        select: 'exhibitionName city dateFrom dateTo exhibitionOwner',
        populate: { path: 'exhibitionOwner', select: 'name mobile designation' }, // ✅ nested
      })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const totalVisits = await ExhibitionVisit.countDocuments(query);
    const totalPages = Math.ceil(totalVisits / limit);

    res.status(200).json({
      success: true,
      visits,
      pagination: {
        currentPage: page,
        totalPages,
        totalVisits,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching visits: ' + error.message });
  }
};

exports.createVisit = async (req, res) => {
  try {
    const user = req.user;
    const {
      exhibition, customerName, companyName, mobile, email,
      location, followUpDate, remark,
      visitorDesignation, leadsType, product,
    } = req.body;

    if (!exhibition || !customerName || !companyName || !mobile) {
      return res.status(400).json({
        success: false,
        error: 'Exhibition, customer name, company name, and mobile are required',
      });
    }

    // ✅ Populate exhibitionOwner to get their mobile for the email
    const exhibitionExists = await Exhibition.findById(exhibition)
      .populate('exhibitionOwner', 'name mobile designation');

    if (!exhibitionExists) {
      return res.status(404).json({ success: false, error: 'Selected exhibition not found' });
    }

    // ✅ Block past exhibitions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (exhibitionExists.dateTo && new Date(exhibitionExists.dateTo) < todayStart) {
      return res.status(400).json({
        success: false,
        error: 'Cannot add visit to a past exhibition. Please select a current or upcoming exhibition.',
      });
    }

    const newVisit = new ExhibitionVisit({
      exhibition,
      customerName,
      companyName,
      mobile,
      email,
      location,
      followUpDate,
      remark,
      visitorDesignation: visitorDesignation || '',
      leadsType: leadsType || '',
      product: product || '',
      company: user.company || user._id,
      createdBy: user._id,
    });

    const saved = await newVisit.save();

    const populated = await ExhibitionVisit.findById(saved._id)
      .select(
        'exhibition customerName companyName mobile email location followUpDate remark ' +
        'visitorDesignation leadsType product createdBy createdAt'
      )
      .populate({
        path: 'exhibition',
        select: 'exhibitionName city dateFrom dateTo exhibitionOwner',
        populate: { path: 'exhibitionOwner', select: 'name mobile designation' },
      })
      .populate('createdBy', 'name');

    // ✅ Send thank-you email — dynamically use exhibitionOwner's contact
    if (email && email.trim()) {
      setImmediate(async () => {
        try {
          const owner = exhibitionExists.exhibitionOwner;
          await sendVisitThankYouEmail({
            customerName,
            companyName,
            mobile,
            email,
            location,
            followUpDate,
            remark,
            visitorDesignation,
            leadsType,
            product,
            exhibitionName:     exhibitionExists.exhibitionName,
            exhibitionCity:     exhibitionExists.city,
            exhibitionDateFrom: exhibitionExists.dateFrom,
            exhibitionDateTo:   exhibitionExists.dateTo,
            // ✅ Pass owner details for the contact card in the email
            ownerName:   owner ? owner.name   : null,
            ownerMobile: owner ? owner.mobile : null,
          });
        } catch (mailErr) {
          console.error('[createVisit] Thank-you email error:', mailErr.message);
        }
      });
    }

    res.status(201).json({ success: true, message: 'Visit recorded successfully', visit: populated });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error creating visit: ' + error.message });
  }
};

exports.updateVisit = async (req, res) => {
  try {
    const visit = await ExhibitionVisit.findByIdAndUpdate(req.params.id, req.body, {
      new: true, runValidators: true,
    })
      .populate('exhibition', 'exhibitionName city')
      .populate('createdBy', 'name');

    if (!visit) return res.status(404).json({ success: false, error: 'Visit not found' });
    res.status(200).json({ success: true, message: 'Visit updated successfully', visit });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error updating visit: ' + error.message });
  }
};

exports.deleteVisit = async (req, res) => {
  try {
    const visit = await ExhibitionVisit.findByIdAndDelete(req.params.id);
    if (!visit) return res.status(404).json({ success: false, error: 'Visit not found' });
    res.status(200).json({ success: true, message: 'Visit deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error deleting visit: ' + error.message });
  }
};