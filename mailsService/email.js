
const transporter = require("./emailTransporter");

exports.sendMail = (res, user, link) => {
  try {

    let mailOptions = {
      from: `DAccess <${process.env.EMAIL }>`,
      to: user.email,
      subject: `Password Reset Request`,
      html: `
      <html>
        <body>
          <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5" style="padding:20px;font-family:Arial,sans-serif;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;">
                  
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding:20px;background-color:#fcf9f9;border-bottom:1px solid #ece8e8;">
                      <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="50" height="50" style="display:block;">
                      <h1 style="font-size:24px;color:#7c3aed;margin:10px 0;">Password Reset Request</h1>
                      <p style="font-size:14px;color:#555;">You requested to reset your password</p>
                    </td>
                  </tr>
                
                  <!-- Body -->
                  <tr>
                    <td style="padding:20px;color:#333;font-size:14px;line-height:20px;">
                      <p>Dear <strong>${user.name}</strong>,</p>
                      <p>We received a request to reset your ProClient360 account password. Click the button below to create a new password.</p>
                
                      <p style="text-align:center;margin:20px 0;">
                        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
                          🔒 Reset Your Password
                        </a>
                      </p>
                
                      <p>This link is valid for <strong>15 minutes</strong> only. If you did not request this, you can safely ignore this email — your password will remain unchanged.</p>
                
                      <p style="margin-top:20px;font-size:13px;color:#666;">
                        If the button above doesn't work, copy and paste this link into your browser:<br>
                        <a href="${link}" style="color:#4f46e5;word-break:break-all;">${link}</a>
                      </p>
                    </td>
                  </tr>
                
                  <!-- Footer -->
                  <tr>
                    <td align="center" bgcolor="#f9fafb" style="padding:15px;font-size:12px;color:#666;">
                      © 2025 ProClient360. All rights reserved.
                    </td>
                  </tr>
                
                </table>
              </td>
            </tr>
          </table>

        </body>
      </html>
    `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return res
          .status(500)
          .json({ error: "Error sending email: " + error.message });
      } else {
        return res
          .status(200)
          .json({
            message:
              "Reset password link is sent to your registered Email Id...",
          });
      }
    });
  } catch (err) {
    console.log("Error in sendMail: ", err);
  }
};
