const Customer = require("../models/customerModel");
const Otp = require("../models/otpModel");
const Ticket = require("../models/ticketModel");
const {
  generateOtp,
  sendOtpViaSms,
  // sendOtpViaEmail, // ❌ Removed import - we don't need it anymore
} = require("../services/otpService");

// ============================================================
// STEP 1 — SEND OTP
// ============================================================
exports.sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile || mobile.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number",
      });
    }

    // ✅ Search across all 5 phone number fields
    const customer = await Customer.findOne({
      $or: [
        { phoneNumber1: mobile },
        { phoneNumber2: mobile },
        { phoneNumber3: mobile },
        { phoneNumber4: mobile },
        { phoneNumber5: mobile },
      ],
    }).populate("company", "companyName");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Mobile number not found in our records",
      });
    }

    // Generate 6-digit OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // ✅ DEBUG: Log OTP to terminal
    console.log("============================================");
    console.log(`🔑 DEBUG OTP FOR ${mobile}: ${otp}`);
    console.log("============================================");

    // Delete any old OTPs for this mobile
    await Otp.deleteMany({ mobile });

    // Save new OTP
    await Otp.create({
      mobile,
      otp,
      customerId: customer._id,
      expiresAt,
    });

    // ✅ SEND SMS ONLY
    // We do not check for email anymore.
    const smsSent = await sendOtpViaSms(mobile, otp);

    if (!smsSent) {
      console.warn("⚠️ SMS failed, but OTP saved to DB. Use the console OTP to login.");
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully to your registered mobile number",
    });
  } catch (error) {
    console.error("❌ Send OTP error:", error);
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

    const otpRecord = await Otp.findOne({
      mobile,
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
      await Otp.deleteMany({ mobile });
      return res.status(400).json({
        success: false,
        message:
          "Too many wrong attempts. Please contact with proclient360.com",
      });
    }

    if (otpRecord.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Incorrect OTP. Please contact with proclient360.com",
      });
    }

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

    // Build full address string
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
        mobile: mobile,
        address: addressParts.join(", "),
        companyName: customer.company?.companyName || "",
        contactPerson:
          customer.customerContactPersonName1 ||
          customer.customerContactPersonName2 ||
          customer.custName,
      },
    });
  } catch (error) {
    console.error("❌ Verify OTP error:", error);
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

    const otpRecord = await Otp.findOne({
      mobile,
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

    const year = new Date().getFullYear();
    const countThisYear = await Ticket.countDocuments({
      uniqueTicketId: { $regex: `^TKT-${year}-` },
    });
    const uniqueTicketId = `TKT-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    const newTicket = await Ticket.create({
      uniqueTicketId,
      company: customer.company,
      client: customer._id,
      Address: customer.billingAddress
        ? [
            customer.billingAddress.add,
            customer.billingAddress.city,
            customer.billingAddress.state,
          ]
            .filter(Boolean)
            .join(", ")
        : "",
      details: complaint,
      product,
      contactPersonEmail: customer.email || "",
      contactPerson:
        customer.customerContactPersonName1 || customer.custName,
      contactNumber: mobile,
      source: "Customer Portal",
      service: "Support",
      isCustomerRaised: true,
    });

    await Otp.deleteMany({ mobile });

    return res.status(201).json({
      success: true,
      message: "Ticket raised successfully",
      ticketId: uniqueTicketId,
      ticket: newTicket,
    });
  } catch (error) {
    console.error("❌ Raise ticket error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};