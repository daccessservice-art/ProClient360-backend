const moment = require("moment");

const Ticket = require("../models/ticketModel");
const transporter = require("./emailTransporter");

exports.sendConfirmationMail = async (id) => {
  try {
    const ticket = await Ticket.findById(id)
      .populate("registerBy", "name")
      .populate("client", "custName email")
      .populate("company", "name landlineNo mobileNo logo");

    console.log("Sending confirmation email to:", ticket.contactPersonEmail);
    console.log(ticket.contactPersonEmail, process.env.EMAIL);

    let mailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: ticket?.contactPersonEmail,
      subject: ` Confirmation: Your Ticket is Created - Ticket ID: ${ticket._id}`,
      html: `
         <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Support Ticket Confirmation</title>
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
                      <h2>Support Ticket Confirmation</h2>
                  </div>
                  <p>Hello <span class="highlight">${
                    ticket?.client?.custName
                  }</span>,</p>
                  <p>Thank you for reaching out to us! We want to let you know that your support ticket has been successfully created. Here are the details for your reference:</p>
                  
                  <div class="ticket-details">
                      <p><strong>Ticket ID:</strong> <span class="highlight">${
                        ticket?._id
                      }</span></p>
                      <p><strong>Product Name:</strong> <span class="highlight">${
                        ticket?.product
                      }</span></p>
                      <p><strong>Issue Description:</strong> <span class="highlight">${
                        ticket?.details
                      }</span></p>
                      <p><strong>Registered By:</strong> <span class="highlight">${
                        ticket?.registerBy?.name
                      }</span></p>
                      <P><strong>Registered On:</strong> <span class="highlight">${moment(
                        ticket?.createdAt
                      ).format("DD MMMM YYYY hh:mm A")}</span></P>
                  </div>
  
                  <p>Our dedicated support team is already on it and will review your ticket shortly. We aim to resolve your issue as quickly as possible.</p>
                  <p>If you have any questions or need further assistance, please feel free to reach us at our toll-free number: ${ticket?.company?.landlineNo || ticket?.company?.mobileNo}.</p>

                  <p>Thank you for trusting ${ticket?.company?.name}!</p>

                  <p>Warm regards,<br>The ${ticket?.company?.name} Service Team</p>
              </div>
              <div class="footer">
                  <p>This email was sent to you by ${ticket?.company?.name}. Please note that this is an auto-generated message, and replies to this email will not be monitored.</p>
              </div>
          </body>
          </html>
        `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error occurred. " + error.message);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  } catch (error) {
    console.error(error);
  }
};
