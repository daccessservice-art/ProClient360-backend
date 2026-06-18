const axios = require("axios");
const nodemailer = require("nodemailer");
require("dotenv").config();

// PowerText SMS API credentials
const POWERTEXT_API_URL = "http://bulk.powertext.in/http-tokenkeyapi.php";
const POWERTEXT_AUTH_KEY = "3738444143434553535353454355524954593130301762250600";
const POWERTEXT_SENDER_ID = "DSSEPL";
const POWERTEXT_ROUTE = "1";
const POWERTEXT_TEMPLATE_ID = "1707173554525599223";

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOtpViaSms = async (mobile, otp) => {
  try {
    // ✅ FIXED: Now sends unique OTP (${otp}) instead of 000111
    const message = `Dear User, Your OTP to registering into our system is ${otp}. It will be valid for 5 minutes. -Team DAccess`;
    
    const url = `${POWERTEXT_API_URL}?authkey=${POWERTEXT_AUTH_KEY}&mobile=${mobile}&message=${encodeURIComponent(
      message
    )}&sender=${POWERTEXT_SENDER_ID}&route=${POWERTEXT_ROUTE}&templateid=${POWERTEXT_TEMPLATE_ID}&country=91`;

    const response = await axios.get(url);
    console.log("✅ PowerText SMS sent:", response.data);
    return true;
  } catch (error) {
    console.error("❌ PowerText SMS error:", error.message);
    return false;
  }
};

const sendOtpViaEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: "OTP for Complaint Registration - ProClient360",
      text: `Dear Customer,\n\nYour OTP for raising a complaint is: ${otp}\n\nThis OTP is valid for 5 minutes.\n\nRegards,\nProClient360 Team`,
    });

    console.log(`✅ OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("❌ Email OTP error:", error.message);
    return false;
  }
};

module.exports = {
  generateOtp,
  sendOtpViaSms,
  sendOtpViaEmail,
};