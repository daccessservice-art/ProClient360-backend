const moment = require("moment");

const Service = require("../models/serviceModel");
const transporter = require("./emailTransporter");

exports.sendFeedbackMail = async (id) => {
  try {
    const service = await Service.findById(id)
      .populate({
        path: "ticket",
        select: "details product date client contactPersonEmail",
        populate: {
          path: "client",
          select: "custName email",
        },
      })
      .populate("allotTo", "name")
      .populate("company", "name landlineNo mobileNo logo");


    const feedbackLink = `${
      process.env.Frontend_URL
    }/feedback/${service?._id}`;
    // console.log(service);

    let mailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: service?.ticket?.contactPersonEmail,
      subject: `Your Ticket #${service?.ticket?._id} has been resolved`,
      html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Support Ticket Resolved Notification</title>
          <style>
              body {
                  font-family: 'Arial', sans-serif;
                  background-color: #f4f4f4;
                  margin: 0;
                  padding: 0;
              }
              .container {
                  max-width: 600px;
                  margin: 20px auto;
                  background-color: #ffffff;
                  padding: 20px;
                  border-radius: 8px;
                  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
              }
              .header {
                  background-color: #4CAF50;
                  color: white;
                  padding: 10px;
                  text-align: center;
                  border-radius: 8px 8px 0 0;
              }
              h2 {
                  margin: 0;
                  font-size: 24px;
              }
              p {
                  color: #555;
                  line-height: 1.6;
              }
              .ticket-details {
                  background-color: #f9f9f9;
                  padding: 15px;
                  border-radius: 5px;
                  margin: 20px 0;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              .footer {
                  margin-top: 20px;
                  font-size: 12px;
                  color: #777;
                  text-align: center;
              }
              .button {
                  display: inline-block;
                  background-color: #4CAF50;
                  color: white;
                  padding: 10px 15px;
                  text-decoration: none;
                  border-radius: 5px;
                  margin-top: 20px;
                  transition: background-color 0.3s;
              }
              .button:hover {
                  background-color: #45a049;
              }
              .highlight {
                  color: #4CAF50;
                  font-weight: bold;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h2>Support Ticket Resolved Notification</h2>
              </div>
              <p>Hello <span class="highlight">${
                service?.ticket?.client?.custName
              }</span>,</p>
              <p>We are pleased to inform you that your support ticket has been successfully resolved. Here are the details:</p>
              
              <div class="ticket-details">
                  <p><strong>Ticket ID:</strong> <span class="highlight">${
                    service?.ticket?._id
                  }</span></p>
                  <p><strong>Ticket Raised Date:</strong> <span class="highlight">${moment(
                    service?.ticket?.date
                  ).format("DD MMMM YYYY")}</span></p>
                  <p><strong>Complaint:</strong> <span class="highlight">${
                    service?.ticket?.details
                  }</span></p>
                  <p><strong>Product:</strong> <span class="highlight">${
                    service?.ticket?.product
                  }</span></p>
                  <p><strong>Engineer Allotment Date:</strong> <span class="highlight">${moment(
                    service?.allotmentDate
                  ).format("DD MMMM YYYY")}</span></p>
                  <p><strong>Actions Performed by Engineer:</strong> <span class="highlight">${
                    service?.remarks
                  }</span></p>
                  <p><strong>Resolved By:</strong> <span class="highlight">${service?.allotTo
                    .map((item) => item?.name)
                    .join(", ")}</span></p>
                  <p><strong>Resolved Date:</strong> <span class="highlight">${moment(
                    service?.completionDate
                  ).format("DD MMMM YYYY")}</span></p>
              </div>

              <p>We value your feedback! Please take a moment to share your experience with us by clicking the link below:</p>
              <a href="${feedbackLink}" class="button">Give Feedback</a>

              <p>If you have any further questions or need assistance, feel free to contact us at our toll-free number: ${service?.company?.landlineNo || service?.company?.mobileNo}.</p>

              <p>Thank you for choosing ${service?.company?.name}!</p>

              <p>Warm regards,<br>The ${service?.company?.name} Service Team</p>
          </div>
          <div class="footer">
              <p>This email was sent to you by ${service?.company?.name}. For any inquiries, please don’t hesitate to contact us.</p>
          </div>
      </body>
      </html>

    `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending feedback email: " + error.message);
      } else {
        console.log("Feedback email sent: " + info.response);
      }
    });
  } catch (err) {
    console.log("Error sending feedback email: " + err.message);
  }
};
