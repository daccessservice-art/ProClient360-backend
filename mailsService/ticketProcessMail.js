const moment = require("moment");
const Service = require("../models/serviceModel");
const transporter = require("./emailTransporter");

// Function to generate a shorter ticket ID
function generateShortTicketId(originalId) {
  // Use last 6 characters of the original ID for brevity
  return originalId.substring(originalId.length - 6).toUpperCase();
}

exports.ticketProcessMail = async (id) => {
  try {
    const service = await Service.findById(id)
      .populate({
        path: "ticket",
        select: "details product date client contactPersonEmail contactNumber mobileNo",
        populate: {
          path: "client",
          select: "custName email mobileNo contactNumber",
        },
      })
      .populate("allotTo", "name email mobileNo mobile contactNumber")
      .populate("company", "name landlineNo mobileNo logo");

    // Generate short ticket ID for customer communication
    const shortTicketId = generateShortTicketId(service?.ticket?._id.toString());

    // Smart mobile number detection function
    const getClientMobile = (service) => {
      return service?.ticket?.contactNumber ||
             service?.ticket?.mobileNo ||
             service?.ticket?.client?.mobileNo ||
             service?.ticket?.client?.contactNumber ||
             'Not provided';
    };

    // Function to get engineer mobile
    const getEngineerMobile = (engineer) => {
      return engineer?.mobileNo || 
             engineer?.mobile || 
             engineer?.contactNumber || 
             'Not provided';
    };

    // Send email to customer
    let customerMailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: service?.ticket?.contactPersonEmail,
      subject: `Service Engineer Assigned to your ticket: ${shortTicketId}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Service Engineer Assignment Notification</title>
            <style>
                body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
                .header { background-color: #4CAF50; color: white; padding: 10px; text-align: center; border-radius: 8px 8px 0 0; }
                h2 { margin: 0; font-size: 24px; }
                p { color: #555; line-height: 1.6; }
                .ticket-details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
                .footer { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
                .button { display: inline-block; background-color: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; margin-top: 20px; transition: background-color 0.3s; }
                .button:hover { background-color: #45a049; }
                .highlight { color: #4CAF50; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Service Engineer Assignment Notification</h2>
                </div>
                <p>Hello <span class="highlight">${service?.ticket?.client?.custName}</span>,</p>
                <p>We are pleased to inform you that a service engineer has been assigned to your support ticket. Here are the details:</p>
                
                <div class="ticket-details">
                    <p><strong>Ticket Reference #:</strong> <span class="highlight">${shortTicketId}</span></p>
                    <p><strong>Full Ticket ID (for reference):</strong> ${service?.ticket?._id}</p>
                    <p><strong>Product Name:</strong> <span class="highlight">${service?.ticket?.product}</span></p>
                    <p><strong>Issue Description:</strong> <span class="highlight">${service?.ticket?.details}</span></p>
                    <p><strong>Assigned Engineer:</strong> <span class="highlight">${service?.allotTo
                        .map((item) => item?.name)
                        .join(", ")}</span></p>
                    <p><strong>Assigned Engineer Mobile:</strong> <span class="highlight">${service?.allotTo
                        .map((item) => getEngineerMobile(item))
                        .join(", ")}</span></p>
                    <p><strong>Visit Date:</strong> <span class="highlight">${moment(
                      service?.allotmentDate
                    ).format("DD MMMM YYYY")}</span></p>
                </div>

                <p>Your assigned engineer will arrive at your location on the specified date and time to resolve your issue. Please ensure that you are available to assist them.</p>
                <p>When contacting support, please use your Ticket Reference #: <strong>${shortTicketId}</strong></p>
                <p>If you have any questions contact us at This toll-free no ${service?.company?.landlineNo||service?.company?.mobileNo} .</p>
                <p>Thank you for trusting ${service?.company?.name}!</p>
                <p>Warm regards,<br>The ${service?.company?.name} Service Team</p>
            </div>
            <div class="footer">
                <p>This email was sent to you by ${service?.company?.name}. For any inquiries, please don't hesitate to contact us.</p>
            </div>
        </body>
        </html>
      `,
    };

    // Send email to assigned engineer(s)
    const engineerEmails = service?.allotTo.map(engineer => engineer.email).filter(email => email);
    
    if (engineerEmails.length > 0) {
      // Get client mobile with smart detection
      const clientMobile = getClientMobile(service);

      let engineerMailOptions = {
        from: `DAccess <${process.env.EMAIL}>`,
        to: engineerEmails.join(", "),
        subject: `New Ticket Assigned: ${shortTicketId}`,
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Ticket Assignment</title>
              <style>
                  body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
                  .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); }
                  .header { background-color: #007bff; color: white; padding: 10px; text-align: center; border-radius: 8px 8px 0 0; }
                  h2 { margin: 0; font-size: 24px; }
                  p { color: #555; line-height: 1.6; }
                  .ticket-details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
                  .footer { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
                  .highlight { color: #007bff; font-weight: bold; }
                  .urgent { color: #dc3545; font-weight: bold; }
              </style>
          </head>
          <body>
              <div class="container">
                  <div class="header">
                      <h2>New Ticket Assignment</h2>
                  </div>
                  <p>Hello <span class="highlight">${service?.allotTo.map(item => item.name).join(", ")}</span>,</p>
                  <p>You have been assigned a new support ticket. Please review the details below:</p>
                  
                  <div class="ticket-details">
                      <p><strong>Ticket Reference #:</strong> <span class="highlight">${shortTicketId}</span></p>
                      <p><strong>Full Ticket ID:</strong> ${service?.ticket?._id}</p>
                      <p><strong>Client:</strong> <span class="highlight">${service?.ticket?.client?.custName}</span></p>
                      <p><strong>Product Name:</strong> <span class="highlight">${service?.ticket?.product}</span></p>
                      <p><strong>Issue Description:</strong> <span class="highlight">${service?.ticket?.details}</span></p>
                      <p><strong>Scheduled Visit Date:</strong> <span class="highlight">${moment(
                        service?.allotmentDate
                      ).format("DD MMMM YYYY")}</span></p>
                      <p><strong>Client Email:</strong> <span class="highlight">${service?.ticket?.contactPersonEmail}</span></p>
                      <p><strong>Client Mobile:</strong> <span class="highlight">${clientMobile}</span></p>
                  </div>

                  <p>Please ensure you contact the client beforehand and arrive at the location on the scheduled date.</p>
                  <p>When communicating with the client, please ask them to reference Ticket #: <strong>${shortTicketId}</strong></p>
                  <p>If you have any questions or need assistance, please contact your supervisor.</p>

                  <p>Best regards,<br>The ${service?.company?.name} Management Team</p>
              </div>
              <div class="footer">
                  <p>This is an automated notification from ${service?.company?.name}.</p>
              </div>
          </body>
          </html>
        `,
      };

      // Send email to engineer
      transporter.sendMail(engineerMailOptions, (error, info) => {
        if (error) {
          console.log("Error sending email to engineer: " + error.message);
        } else {  
          console.log("Engineer email sent: " + info.response);
        }
      });
    }

    // Send email to customer
    transporter.sendMail(customerMailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email to customer: " + error.message);
      } else {
        console.log("Customer email sent: " + info.response);
      }
    });

  } catch (error) {
    console.log("Error while sending the mail: " + error.message);
  }
};