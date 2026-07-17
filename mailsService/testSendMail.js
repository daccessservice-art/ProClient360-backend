require("dotenv").config();
const transporter = require("./emailTransporter");
const cron = require('node-cron');

// The canteen management HTML content
const emailHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CafeLive Canteen Management System</title>
</head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
        <td width="20" bgcolor="#d62828">&nbsp;</td>
        <td bgcolor="#ffffff">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                    <td style="padding:30px 5% 0;">
                        <p style="margin:0;font-size:22px;font-weight:bold;color:#0b63b6;line-height:40px;">
                            Still Managing Your Canteen Manually? It's Time to Go Digital.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td style="padding:10px 5%;">
                        <p style="font-size:16px;line-height:28px;color:#333;">
                            We would like to introduce our <b>Canteen Management System</b>, designed to streamline and digitize your entire food service operations.
                        </p>
                        <p style="font-size:16px;line-height:28px;color:#333;">
                            Our solution helps organizations efficiently manage food ordering, billing and consumption tracking while improving user convenience and operational control.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding:0 3% 20px;">
                        <img src="https://firebasestorage.googleapis.com/v0/b/nishintams.appspot.com/o/Visitordoc%2Fimage%20%283%29%20%281%29.png.png?alt=media&token=907607ed-bdcd-468b-b57a-049b04d566a4" style="width:100%;display:block;">
                    </td>
                </tr>
                <tr>
                    <td style="padding:0 5%;">
                        <h2 style="margin:0 0 15px;">Key Highlights</h2>
                        <ul style="font-size:16px;line-height:30px;">
                            <li>Digital food ordering via mobile app or kiosk</li>
                            <li>Cashless payments through cards / QR integration</li>
                            <li>Real-time consumption tracking and reports</li>
                            <li>Vendor-wise billing and settlement management</li>
                            <li>User-friendly interface for employees and vendors</li>
                            <li>Detailed analytics for better decision-making</li>
                        </ul>
                    </td>
                </tr>
                <tr>
                    <td style="padding:20px 5%;">
                        <p style="font-size:16px;line-height:28px;">
                            The system reduces manual effort, minimizes errors, and enhances the overall canteen experience for both employees and management.
                        </p>
                        <p style="font-size:16px;line-height:28px;">
                            We would be happy to schedule a quick demo to showcase how this solution can benefit your organization.
                        </p>
                        <p style="font-size:16px;">
                            Looking forward to your response.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding:20px 0 40px;">
                        <table cellpadding="0" cellspacing="0">
                            <tr>
                                <td bgcolor="#d62828" style="border-radius:6px;">
                                    <a href="https://daccess.co.in/support/" style="display:block;padding:16px 60px;color:#fff;text-decoration:none;font-size:18px;font-weight:bold;">
                                        Yes, I'm Interested
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
        <td width="20" bgcolor="#d62828">&nbsp;</td>
    </tr>
</table>
</body>
</html>`;

// Recipients
const RECIPIENTS = [
  "nilkanth@daccess.co",
  "haraleganesh@daccess.co",
  "ganeshg@daccess.co",
  "namrata@daccess.co"
];

const sendCanteenEmail = () => {
  const mailOptions = {
    from: `CafeLive <${process.env.EMAIL}>`,
    to: RECIPIENTS.join(','),
    subject: "CafeLive Canteen Management System",
    html: emailHtml,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("❌ Send failed:", error.message);
    } else {
      console.log("✅ Email sent:", info.response, "at", new Date().toISOString());
    }
  });
};

let scheduledTask = null;

const initializeCanteenEmailScheduler = () => {
  if (scheduledTask) {
    scheduledTask.destroy();
  }

  // Scheduled daily send at 3:18 PM IST
  scheduledTask = cron.schedule('28 15 * * *', () => {
    console.log('⏰ CRON: Sending scheduled canteen email at', new Date().toISOString());
    sendCanteenEmail();
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('📅 Canteen email scheduler initialized — will send daily at 3:28 PM IST.');
};

module.exports = {
  sendCanteenEmail,
  initializeCanteenEmailScheduler
};