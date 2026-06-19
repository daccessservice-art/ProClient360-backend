const nodemailer = require("nodemailer");
require("dotenv").config();

// ============================================================
// GENERATE OTP
// ============================================================
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ============================================================
// SEND OTP VIA EMAIL
// ============================================================
const sendOtpViaEmail = async (email, otp) => {
  try {
    const emailUser = process.env.EMAIL;
    const emailPass = process.env.EMAIL_APP_PASSWORD;

    // ✅ Debug log — confirm correct env values are loaded
    console.log("============================================");
    console.log(`📧 SMTP USER  : [${emailUser}]`);
    console.log(`📧 SMTP PASS  : [${emailPass ? emailPass.length + " chars" : "MISSING"}]`);
    console.log(`📧 SENDING TO : [${email}]`);
    console.log("============================================");

    if (!emailUser || !emailPass) {
      console.error("❌ EMAIL or EMAIL_APP_PASSWORD is missing in .env");
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      tls: {
        rejectUnauthorized: false,
      },
      auth: {
        user: emailUser.trim(),
        pass: emailPass.trim(),
      },
    });

    // Verify SMTP connection
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");

    const htmlContent = `
      <div style="font-family:Poppins,Arial,sans-serif;max-width:650px;margin:auto;background:#ffffff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1);overflow:hidden;">
        <div style="background:#1565c0;color:#fff;text-align:center;padding:18px 10px;font-size:20px;font-weight:600;">
          Complaint Registration – OTP Verification
        </div>
        <div style="padding:25px 30px;color:#333;">
          <p>Dear <b>Valued Customer</b>,</p>
          <p>We received a request to raise a support complaint on <b>ProClient360</b>.</p>
          <p style="margin-top:20px;font-size:15px;">
            Please use the following <b>One-Time Password (OTP)</b> to verify your identity:
          </p>
          <div style="margin:20px 0;text-align:center;">
            <span style="display:inline-block;background:#f1f5ff;color:#1565c0;font-size:32px;letter-spacing:6px;padding:14px 30px;border-radius:8px;font-weight:700;">
              ${otp}
            </span>
          </div>
          <p>This OTP is valid for the next <b>5 minutes</b>.</p>
          <p style="color:#d32f2f;font-size:13px;">
            ⚠️ Do not share this OTP with anyone.
          </p>
          <p>If you did not request this, please ignore this email or contact support.</p>
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

    const info = await transporter.sendMail({
      from: `"ProClient360 Support" <${emailUser.trim()}>`,
      to: email,
      subject: "OTP for Complaint Registration – ProClient360",
      html: htmlContent,
    });

    console.log(`✅ Email sent successfully to ${email}`);
    console.log(`📨 Message ID: ${info.messageId}`);
    return true;

  } catch (error) {
    console.error("❌ Email OTP send failed:");
    console.error("   Message  :", error.message);
    console.error("   Code     :", error.code);
    console.error("   Response :", error.response);
    return false;
  }
};

// ============================================================
// SMS OTP — Disabled, kept for future use
// ============================================================
const sendOtpViaSms = async (mobile, otp) => {
  console.log("⚠️ SMS sending is disabled. Email OTP is used instead.");
  return false;
};

module.exports = {
  generateOtp,
  sendOtpViaSms,
  sendOtpViaEmail,
};