const Customer = require("../models/customerModel");
const Otp = require("../models/otpModel");
const Ticket = require("../models/ticketModel");
const {
  generateOtp,
  sendOtpViaEmail,
} = require("../services/otpService");

// ============================================================
// STEP 1 — SEND OTP
// ============================================================
exports.sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || String(mobile).trim().length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number",
      });
    }

    const mobileStr = String(mobile).trim();

    // ✅ Search all 5 phone fields
    const customer = await Customer.findOne({
      $or: [
        { phoneNumber1: mobileStr },
        { phoneNumber2: mobileStr },
        { phoneNumber3: mobileStr },
        { phoneNumber4: mobileStr },
        { phoneNumber5: mobileStr },
      ],
    }).populate("company", "companyName");

    console.log("🔍 Customer lookup for mobile:", mobileStr);
    console.log("🔍 Customer found:", customer ? customer.custName : "NOT FOUND");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Mobile number not found in our records. Please contact support.",
      });
    }

    if (!customer.email || customer.email.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "No email address registered for this account. Please contact support.",
      });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    console.log("============================================");
    console.log(`🔑 OTP FOR ${mobileStr}: ${otp}`);
    console.log(`📧 Will send to: ${customer.email}`);
    console.log("============================================");

    // Delete any existing OTP for this mobile
    await Otp.deleteMany({ mobile: mobileStr });

    // Save new OTP record
    await Otp.create({
      mobile: mobileStr,
      otp,
      customerId: customer._id,
      expiresAt,
    });

    // Send OTP via Email
    const emailSent = await sendOtpViaEmail(customer.email.trim(), otp);

    if (emailSent) {
      console.log(`✅ OTP email sent to ${customer.email}`);
      return res.status(200).json({
        success: true,
        message: "OTP sent to your registered email address",
      });
    } else {
      // Email failed — delete the OTP so user can retry
      await Otp.deleteMany({ mobile: mobileStr });
      console.error(`❌ Failed to send OTP email to ${customer.email}`);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again after some time.",
      });
    }

  } catch (error) {
    console.error("❌ sendOtp controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================
// STEP 2 — VERIFY OTP
// ============================================================
exports.verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }

    const mobileStr = String(mobile).trim();
    const otpStr = String(otp).trim();

    const otpRecord = await Otp.findOne({
      mobile: mobileStr,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not found. Please request a new OTP.",
      });
    }

    otpRecord.attempts += 1;
    await otpRecord.save();

    if (otpRecord.attempts > 3) {
      await Otp.deleteMany({ mobile: mobileStr });
      return res.status(400).json({
        success: false,
        message: "Too many wrong attempts. Please request a new OTP.",
      });
    }

    if (otpRecord.otp !== otpStr) {
      const remaining = 3 - otpRecord.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
      });
    }

    // OTP is correct
    otpRecord.isVerified = true;
    await otpRecord.save();

    const customer = await Customer.findById(otpRecord.customerId).populate(
      "company",
      "companyName"
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer record not found",
      });
    }

    // Build display address string
    const addressParts = [];
    if (customer.billingAddress) {
      if (customer.billingAddress.add) addressParts.push(customer.billingAddress.add);
      if (customer.billingAddress.city) addressParts.push(customer.billingAddress.city);
      if (customer.billingAddress.state) addressParts.push(customer.billingAddress.state);
      if (customer.billingAddress.country) addressParts.push(customer.billingAddress.country);
      if (customer.billingAddress.pincode) addressParts.push(customer.billingAddress.pincode);
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      customer: {
        _id: customer._id,
        custName: customer.custName,
        email: customer.email,
        mobile: mobileStr,
        address: addressParts.join(", "),
        companyName: customer.company?.companyName || "",
        contactPerson:
          customer.customerContactPersonName1 ||
          customer.customerContactPersonName2 ||
          customer.custName,
      },
    });

  } catch (error) {
    console.error("❌ verifyOtp controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================
// STEP 3 — RAISE TICKET
// ============================================================
exports.raiseTicket = async (req, res) => {
  try {
    const { mobile, product, complaint } = req.body;

    if (!mobile || !product || !complaint) {
      return res.status(400).json({
        success: false,
        message: "Mobile, product, and complaint are required",
      });
    }

    const mobileStr = String(mobile).trim();

    // Check OTP session is still valid and verified
    const otpRecord = await Otp.findOne({
      mobile: mobileStr,
      isVerified: true,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please verify OTP again.",
      });
    }

    const customer = await Customer.findById(otpRecord.customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // ✅ Build Address object — ticketSchema requires object not string
    const b = customer.billingAddress || {};
    const Address = {
      add:     (b.add     && b.add.trim()     !== "") ? b.add.trim()     : "N/A",
      city:    (b.city    && b.city.trim()    !== "") ? b.city.trim()    : "N/A",
      state:   (b.state   && b.state.trim()   !== "") ? b.state.trim()   : "N/A",
      country: (b.country && b.country.trim() !== "") ? b.country.trim() : "India",
      pincode: (b.pincode && b.pincode !== "")        ? b.pincode        : 0,
    };

    // Generate unique Ticket ID
    const year = new Date().getFullYear();
    const countThisYear = await Ticket.countDocuments({
      uniqueTicketId: { $regex: `^TKT-${year}-` },
    });
    const uniqueTicketId = `TKT-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    console.log(`🎫 Creating ticket ${uniqueTicketId} for customer: ${customer.custName}`);

    const newTicket = await Ticket.create({
      uniqueTicketId,
      company:            customer.company,
      client:             customer._id,
      Address,
      details:            complaint.trim(),
      product,
      contactPersonEmail: customer.email || "",
      contactPerson:      customer.customerContactPersonName1 || customer.custName,
      contactNumber:      Number(mobileStr),
      source:             "Customer Portal",
      isCustomerRaised:   true,
    });

    console.log(`✅ Ticket created: ${uniqueTicketId}`);

    // Clean up OTP
    await Otp.deleteMany({ mobile: mobileStr });

    return res.status(201).json({
      success: true,
      message: "Ticket raised successfully",
      ticketId: uniqueTicketId,
      ticket: newTicket,
    });

  } catch (error) {
    console.error("❌ raiseTicket controller error:", error);
    return res.status(500).json({
      success: false,
      message: error.message.includes("validation failed")
        ? "Ticket data error: " + error.message
        : "Internal server error",
      error: error.message,
    });
  }
};