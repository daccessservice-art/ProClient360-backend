const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const Ticket = require("../models/ticketModel");
const { sendConfirmationMail } = require("../mailsService/sendTicketConfirmationMail");

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;
    const {q} = req.query;

    const searchRegex = new RegExp(q, 'i');

    let query = {
      company: user.company ? user.company : user._id,
      service: null,
    };

    if(q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"){
      skip = 0;
      page = 1;
      query = {
        $or: [
          { product: { $regex: searchRegex } },
        ],
        company: user.company ? user.company : user._id,
        service: null,
      };
    }

    const tickets = await Ticket.find(query)
      .skip(skip)
      .limit(limit)
      .populate("registerBy", "name")
      .populate("client", "custName")
      .sort({ date: -1 })
      .lean();

    if (tickets.length <= 0) {
      return res
        .status(404)
        .json({ success:false, message: " There are no new tickets available yet." });
    }

    const totalRecords = await Ticket.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      tickets,
      pagination: {
        currentPage: page,
        totalPages,
        totalRecords,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while featching the Tickets : " + error.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      client,
      Address,
      details,
      product,
      contactPerson,
      contactNumber,
      contactPersonEmail,
      source,
    } = req.body;
    const updatedData = {
      client,
      Address,
      details,
      product,
      contactPerson,
      contactPersonEmail,
      contactNumber,
      source,
    };
    const ticket = await Ticket.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true
    });
    if (!ticket) {
      return res.status(404).json({success:false, error: "Ticket not found..." });
    }

    res.status(200).json({ 
      message: "Ticket Updated...",
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while Updating the Ticket : " + error.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      client,
      Address,
      details,
      product,
      contactPersonEmail,
      contactPerson,
      contactNumber,
      source,
    } = req.body;

    if(!client || !Address || !details || !product || !contactPersonEmail || !contactPerson || !contactNumber || !source){
      return res.status(400).json({ error: "Please fill all the fields..." });
    }

    const ticket = new Ticket({
      company: req.user.company,
      client,
      Address,
      details,
      product,
      contactPersonEmail,
      contactPerson,
      contactNumber,
      source,
      registerBy: req.user._id,
    });
    await ticket.save();
    sendConfirmationMail(ticket._id);
    res.status(201).json({
      success: true,
      message: "Ticket Created Successfully..." 
    });
  } catch (error) {
    res.status(500).json({
      error: "Error while Creating the Ticket : " + error.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findByIdAndDelete(id);
    if (!ticket) {
      return res.status(404).json({success:false, error: "Ticket not found..." });
    }
    res.status(200).json({success:true, message: "Ticket Deleted Successfully..." });
  } catch (error) {
    res.status(500).json({
      error: "Error while deleting the Ticket: " + error.message,
    });
  }
};
