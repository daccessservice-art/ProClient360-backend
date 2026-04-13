const transporter = require("./emailTransporter");
const { formatDate } = require('../utils/formatDate');

/**
 * Sends a task completion notification email to the person who assigned the task.
 *
 * @param {Object} params
 * @param {string} params.assignerEmail  - Email of the person who assigned the task
 * @param {string} params.assignerName   - Name of the assigner
 * @param {string} params.employeeName   - Name(s) of employee(s) who completed the task
 * @param {string} params.taskName       - Task name
 * @param {string} params.projectName    - Project name
 * @param {Date}   params.startDate      - Task start date
 * @param {Date}   params.endDate        - Task end date
 */
exports.taskCompletedMail = async ({
  assignerEmail,
  assignerName,
  employeeName,
  taskName,
  projectName,
  startDate,
  endDate,
}) => {
  try {
    const mailOptions = {
      from: `ProClient360 <${process.env.EMAIL}>`,
      to: assignerEmail,
      subject: `✅ Task Completed: ${taskName}`,
      html: `
        <html>
        <body>
          <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f5" style="padding:20px;font-family:Arial,sans-serif;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding:24px 20px 16px;background-color:#f0fdf4;border-bottom:2px solid #22c55e;">
                      <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="50" height="50" style="display:block;margin:0 auto 12px;">
                      <h1 style="font-size:22px;color:#16a34a;margin:0;">✅ Task Completed!</h1>
                      <p style="font-size:14px;color:#555;margin:6px 0 0;">A task assigned by you has been marked as 100% complete</p>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:24px 20px;color:#333;font-size:14px;line-height:22px;">
                      <p>Dear <strong>${assignerName}</strong>,</p>
                      <p>Great news! <strong>${employeeName}</strong> has completed the following task assigned by you. Here are the details:</p>

                      <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;margin-top:12px;">
                        <tr style="background:#f0fdf4;">
                          <td style="font-weight:bold;width:35%;border-bottom:1px solid #e2e8f0;">Project Name:</td>
                          <td style="border-bottom:1px solid #e2e8f0;">${projectName}</td>
                        </tr>
                        <tr>
                          <td style="font-weight:bold;border-bottom:1px solid #e2e8f0;">Task Name:</td>
                          <td style="border-bottom:1px solid #e2e8f0;">${taskName}</td>
                        </tr>
                        <tr style="background:#f0fdf4;">
                          <td style="font-weight:bold;border-bottom:1px solid #e2e8f0;">Completed By:</td>
                          <td style="border-bottom:1px solid #e2e8f0;">${employeeName}</td>
                        </tr>
                        <tr>
                          <td style="font-weight:bold;border-bottom:1px solid #e2e8f0;">Start Date:</td>
                          <td style="border-bottom:1px solid #e2e8f0;">${formatDate(startDate)}</td>
                        </tr>
                        <tr style="background:#f0fdf4;">
                          <td style="font-weight:bold;">End Date:</td>
                          <td>${formatDate(endDate)}</td>
                        </tr>
                      </table>

                      <div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;">
                        <p style="margin:0;font-size:14px;color:#166534;">
                          <strong>Status:</strong> ✅ 100% Completed
                        </p>
                      </div>

                      <p style="text-align:center;margin-top:24px;">
                        <a href="https://proclient360.com" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px;">
                          📋 View Task Details
                        </a>
                      </p>

                      <p style="margin-top:16px;font-size:13px;color:#666;">
                        You can review the task actions and progress in your ProClient360 dashboard.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td align="center" bgcolor="#f9fafb" style="padding:16px;font-size:12px;color:#888;border-top:1px solid #e5e7eb;">
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
        console.error("Error sending task completion email:", error);
      } else {
        console.log("Task completion email sent:", info.response);
      }
    });
  } catch (err) {
    console.error("Error in taskCompletedMail:", err);
  }
};