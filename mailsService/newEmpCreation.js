const transporter = require("./emailTransporter");
const Company = require('../models/companyModel');


exports.newUserMail = async (user, password) => {
    const company = await Company.findById(user.company).select('name');
    try {
        let mailOptions = {
            from: `ProClient360 <${process.env.EMAIL }>`,
            to: user.email,
            subject: `Welcome to ProClient360`,
            html:`<!DOCTYPE html>
                    <html lang="en">
                    <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Welcome to ProClient360</title>
                    </head>

                    <body>
                    <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5" style="padding:20px;font-family:Arial,sans-serif;">
                        <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;">
                            <tr>
                                <td align="center" style="padding:20px;background-color:#fcf9f9;border-bottom:1px solid #ece8e8;">
                                <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="50" height="50" style="display:block;">
                                <h1 style="font-size:24px;color:#7c3aed;margin:10px 0;">Welcome to ProClient360!</h1>
                                <p style="font-size:14px;color:#555;">Your account is ready and we're excited to have you aboard</p>
                                </td>
                            </tr>
                    
                            <tr>
                                <td style="padding:20px;color:#333;font-size:14px;line-height:20px;">
                                <p>Dear <strong>${user.name}</strong>,</p>
                                <p>We're thrilled to welcome you to <strong>${company.name}</strong>! Your account has been successfully created.</p>

                                <h3 style="color:#4f46e5;">Your Account Information</h3>
                                <table width="100%" cellpadding="5" cellspacing="0" style="border:1px solid #e2e8f0;background:#f8fafc;">
                                    <tr>
                                    <td style="font-weight:bold;">Email/Username:</td>
                                    <td>${user.email}</td>
                                    </tr>
                                    <tr>
                                    <td style="font-weight:bold;">Password:</td>
                                    <td style="color:#d33;font-weight:bold;">${password}</td>
                                    </tr>
                                </table>
                    
                                <p style="text-align:center;margin-top:20px;">
                                    <a href="https://proclient360.com" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">🚀 Login to Your Account</a>
                                </p>
                    
                                <p style="margin-top:20px;">If you have any questions, contact our support team.</p>
                                </td>
                            </tr>
                    
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

                    </html>`
        };

     transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email: ", error);
        return false;
      } else {
        console.log("Email sent: ", info.response);
        return true;
      }
    });
  } catch (err) {
    console.log("Error in sendMail: ", err);
  }
};

