const transporter = require("./emailTransporter");

exports.sendMail = (res, user, link) => {
  try {
    if (!link) {
      return res.status(500).json({ error: "Reset link is missing." });
    }

    console.log("Sending reset link:", link); // 👈 Check this in terminal

    const mailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: user.email,
      subject: `Password Reset Request`,
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding:30px;background:#fcf9f9;border-bottom:1px solid #ece8e8;">
              <h1 style="font-size:22px;color:#7c3aed;margin:0;">Password Reset Request</h1>
              <p style="font-size:13px;color:#888;margin:8px 0 0;">You requested to reset your password</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;font-size:15px;color:#333;line-height:24px;">
              <p>Dear <strong>${user.name}</strong>,</p>
              <p>Click the button below to reset your <strong>ProClient360</strong> password.</p>

              <!-- BUTTON -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0;">
                <tr>
                  <td align="center">
                    <a href="${link}"
                       target="_blank"
                       style="display:inline-block;
                              background-color:#4f46e5;
                              color:#ffffff;
                              padding:14px 36px;
                              border-radius:6px;
                              text-decoration:none;
                              font-size:16px;
                              font-weight:bold;
                              font-family:Arial,sans-serif;">
                      Reset Your Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#666;">
                This link is valid for <strong>15 minutes</strong> only.<br>
                If you did not request this, ignore this email.
              </p>

              <!-- PLAIN TEXT FALLBACK -->
              <p style="margin-top:20px;padding:14px;background:#f4f4f8;border-radius:6px;font-size:12px;color:#666;word-break:break-all;">
                Button not working? Copy this link into your browser:<br><br>
                <a href="${link}" style="color:#4f46e5;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:16px;background:#f9fafb;font-size:12px;color:#aaa;border-top:1px solid #eee;">
              &copy; 2025 ProClient360. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res.status(500).json({ error: "Error sending email: " + error.message });
      }
      return res.status(200).json({ message: "Reset password link sent to your email." });
    });

  } catch (err) {
    console.error("Error in sendMail:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};