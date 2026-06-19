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
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    console.log("============================================");
    console.log(`🔑 OTP FOR ${mobileStr}: ${otp}`);
    console.log(`📧 Will send to: ${customer.email}`);
    console.log("============================================");

    await Otp.deleteMany({ mobile: mobileStr });

    await Otp.create({
      mobile: mobileStr,
      otp,
      customerId: customer._id,
      expiresAt,
    });

    const emailSent = await sendOtpViaEmail(customer.email.trim(), otp);

    if (emailSent) {
      console.log(`✅ OTP email sent to ${customer.email}`);
      return res.status(200).json({
        success: true,
        message: "OTP sent to your registered email address",
      });
    } else {
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
// ✅ NEW — SEND TICKET CONFIRMATION EMAIL TO CUSTOMER
// ============================================================
const sendTicketConfirmationToCustomer = async (email, custName, ticketId, product, complaint) => {
  try {
    const nodemailer = require("nodemailer");

    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      tls: { rejectUnauthorized: false },
      auth: {
        user: process.env.EMAIL.trim(),
        pass: process.env.EMAIL_APP_PASSWORD.trim(),
      },
    });

    const htmlContent = `
      <div style="font-family:Poppins,Arial,sans-serif;max-width:650px;margin:auto;background:#ffffff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);overflow:hidden;">
        <div style="background:#1565c0;color:#fff;text-align:center;padding:18px 10px;font-size:20px;font-weight:600;">
          Complaint Registered Successfully ✅
        </div>
        <div style="padding:25px 30px;color:#333;">
          <p>Dear <b>${custName}</b>,</p>
          <p>Thank you for reaching out to us. Your complaint has been registered successfully.</p>
          
          <div style="margin:20px 0;background:#f1f5ff;border-left:4px solid #1565c0;padding:15px 20px;border-radius:4px;">
            <p style="margin:0 0 8px 0;font-size:13px;color:#666;">YOUR TICKET ID</p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#1565c0;letter-spacing:2px;">${ticketId}</p>
          </div>

          <table style="width:100%;border-collapse:collapse;margin:15px 0;">
            <tr style="background:#f9f9f9;">
              <td style="padding:10px 12px;font-weight:600;color:#555;width:40%;border:1px solid #eee;">Product</td>
              <td style="padding:10px 12px;border:1px solid #eee;">${product}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;font-weight:600;color:#555;border:1px solid #eee;">Complaint</td>
              <td style="padding:10px 12px;border:1px solid #eee;">${complaint}</td>
            </tr>
            <tr style="background:#f9f9f9;">
              <td style="padding:10px 12px;font-weight:600;color:#555;border:1px solid #eee;">Status</td>
              <td style="padding:10px 12px;border:1px solid #eee;color:#e65100;font-weight:600;">Open</td>
            </tr>
          </table>

          <p>Our support team will contact you shortly regarding your complaint.</p>
          <p style="color:#d32f2f;font-size:13px;">⚠️ Please save your Ticket ID <b>${ticketId}</b> for future reference.</p>
          <br/>
          <p>Thanks &amp; Regards,</p>
          <p><b>Team ProClient360</b></p>
        </div>
        <div style="text-align:center;background:#f9f9f9;padding:15px 10px;font-size:13px;color:#666;">
          <p style="margin:0;">
            Powered by
            <a href="https://proclient360.com" style="color:#1565c0;text-decoration:none;">ProClient360</a>
          </p>
        </div>
        <div style="padding:10px 20px 15px 20px;overflow:hidden;">
          <div style="float:left;font-size:12px;color:#999;">www.proclient360.com</div>
          <div style="float:right;font-size:12px;color:#999;">ProClient360 Support</div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"ProClient360 Support" <${process.env.EMAIL.trim()}>`,
      to: email,
      subject: `Complaint Registered – Ticket ID: ${ticketId} – ProClient360`,
      html: htmlContent,
    });

    console.log(`✅ Ticket confirmation email sent to ${email} for ticket ${ticketId}`);
    return true;

  } catch (error) {
    // Don't fail ticket creation if confirmation email fails
    console.error("❌ Ticket confirmation email failed:", error.message);
    return false;
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

    const b = customer.billingAddress || {};
    const Address = {
      add:     (b.add     && b.add.trim()     !== "") ? b.add.trim()     : "N/A",
      city:    (b.city    && b.city.trim()    !== "") ? b.city.trim()    : "N/A",
      state:   (b.state   && b.state.trim()   !== "") ? b.state.trim()   : "N/A",
      country: (b.country && b.country.trim() !== "") ? b.country.trim() : "India",
      pincode: (b.pincode && b.pincode !== "")        ? b.pincode        : 0,
    };

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

    // ✅ Send confirmation email to customer (non-blocking)
    sendTicketConfirmationToCustomer(
      customer.email,
      customer.custName,
      uniqueTicketId,
      product,
      complaint.trim()
    );

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