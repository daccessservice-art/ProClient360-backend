const transporter = require("./emailTransporter");

exports.sendMail = (res, user, link) => {
  try {
    if (!link) {
      console.error("sendMail ERROR: reset link is undefined or empty!");
      return res.status(500).json({ error: "Reset link could not be generated." });
    }

    console.log("Reset link:", link);

    let mailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: user.email,
      subject: `Password Reset Request`,
      html: `<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8"></head>
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5" style="padding:30px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

            <!-- Header -->
            <tr>
              <td align="center" bgcolor="#fcf9f9" style="padding:30px 20px;border-bottom:1px solid #ece8e8;">
                <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="50" height="50" style="display:block;margin:0 auto 12px;">
                <h1 style="font-size:22px;color:#7c3aed;margin:0 0 6px;">Password Reset Request</h1>
                <p style="font-size:13px;color:#888;margin:0;">You requested to reset your password</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:30px;color:#333;font-size:15px;line-height:24px;">
                <p style="margin:0 0 16px;">Dear <strong>${user.name}</strong>,</p>
                <p style="margin:0 0 24px;">We received a request to reset your <strong>ProClient360</strong> account password. Click the button below to create a new password.</p>

                <!-- BUTTON - Works in Gmail + Outlook -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td align="center">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                        href="${link}"
                        style="height:44px;width:220px;v-text-anchor:middle;"
                        arcsize="10%"
                        fillcolor="#4f46e5">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Arial;font-size:15px;font-weight:bold;">
                          Reset Your Password
                        </center>
                      </v:roundrect>
                      <![endif]-->
                      <!--[if !mso]><!-->
                      <a href="${link}"
                         target="_blank"
                         style="display:inline-block;
                                background-color:#4f46e5;
                                color:#ffffff;
                                padding:14px 36px;
                                border-radius:6px;
                                text-decoration:none;
                                font-size:15px;
                                font-weight:bold;
                                font-family:Arial,sans-serif;">
                        Reset Your Password
                      </a>
                      <!--<![endif]-->
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:13px;color:#666;">
                  This link is valid for <strong>15 minutes</strong> only.
                  If you did not request this, you can safely ignore this email — your password will remain unchanged.
                </p>

                <!-- Fallback plain text link -->
                <p style="margin:20px 0 0;padding:14px;background:#f4f4f8;border-radius:6px;font-size:12px;color:#666;word-break:break-all;">
                  If the button doesn't work, copy and paste this link into your browser:<br><br>
                  <a href="${link}" target="_blank" style="color:#4f46e5;">${link}</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" bgcolor="#f9fafb" style="padding:18px;font-size:12px;color:#aaa;border-top:1px solid #eee;">
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
        console.error("Mail error:", error);
        return res.status(500).json({ error: "Error sending email: " + error.message });
      }
      return res.status(200).json({ message: "Reset password link is sent to your registered Email Id..." });
    });

  } catch (err) {
    console.error("Error in sendMail:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};