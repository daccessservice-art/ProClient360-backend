const moment = require("moment");
const Service = require("../models/serviceModel");
const transporter = require("./emailTransporter");

/**
 * Send feedback notification to engineers and company when feedback is submitted
 * @param {Object} feedbackData - The feedback data containing rating, message, service ID, etc.
 * @returns {Object} - Result of the operation
 */
exports.sendFeedbackNotification = async (feedbackData) => {
  try {
    console.log("Sending feedback notification with data:", feedbackData);
    
    // Fetch the service with all populated data
    const service = await Service.findById(feedbackData.service)
      .populate({
        path: "ticket",
        select: "details product date client contactPersonEmail contactPerson contactNumber",
        populate: {
          path: "client",
          select: "custName email",
        },
      })
      .populate("allotTo", "name email")
      .populate("company", "name landlineNo mobileNo logo email");

    if (!service) {
      throw new Error("Service not found");
    }

    console.log("Service found:", service._id);
    
    // Get engineer emails
    const engineerEmails = service.allotTo
      .map(engineer => engineer.email)
      .filter(email => email);
    console.log("Engineer emails:", engineerEmails);
    
    // Get company email
    const companyEmail = service.company?.email;
    console.log("Company email:", companyEmail);
    
    // Prepare email content
    const ratingLabels = ["Good", "Very Good", "Excellent", "Outstanding", "Amazing"];
    const ratingLabel = ratingLabels[feedbackData.rating - 1] || "No rating";
    
    // Create star rating display
    const starRating = `${'★'.repeat(feedbackData.rating)}${'☆'.repeat(5 - feedbackData.rating)}`;
    
    // Send email to engineer(s)
    if (engineerEmails.length > 0) {
      try {
        await sendEmailToEngineers(service, feedbackData, engineerEmails, starRating, ratingLabel);
      } catch (emailError) {
        console.error("Error sending email to engineers:", emailError);
      }
    } else {
      console.log("No engineer emails found");
    }
    
    // Send email to company
    if (companyEmail) {
      try {
        await sendEmailToCompany(service, feedbackData, companyEmail, starRating, ratingLabel);
      } catch (emailError) {
        console.error("Error sending email to company:", emailError);
      }
    } else {
      console.log("No company email found");
    }

    return { success: true, message: "Feedback notifications sent successfully" };
  } catch (err) {
    console.log("Error sending feedback notification: " + err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send email to engineers
 */
const sendEmailToEngineers = async (service, feedbackData, engineerEmails, starRating, ratingLabel) => {
  const engineerMailOptions = {
    from: `DAccess <${process.env.EMAIL}>`,
    to: engineerEmails.join(","),
    subject: `New Feedback Submitted for Ticket #${service.ticket._id}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Feedback Notification</title>
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
                  background-color: #2196F3;
                  color: white;
                  padding: 10px;
                  text-align: center;
                  border-radius: 8px 8px 0 0;
              }
              .feedback-details {
                  background-color: #f9f9f9;
                  padding: 15px;
                  border-radius: 5px;
                  margin: 20px 0;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              .ticket-details {
                  background-color: #e3f2fd;
                  padding: 15px;
                  border-radius: 5px;
                  margin: 20px 0;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              .rating {
                  color: #ffc107;
                  font-size: 24px;
              }
              .footer {
                  margin-top: 20px;
                  font-size: 12px;
                  color: #777;
                  text-align: center;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h2>New Feedback Received</h2>
              </div>
              <p>Hello Engineer,</p>
              <p>New feedback has been submitted for a service you were assigned to. Here are the details:</p>
              
              <div class="feedback-details">
                  <h3>Feedback Details</h3>
                  <p><strong>Rating:</strong> <span class="rating">${starRating} (${ratingLabel})</span></p>
                  <p><strong>Message:</strong> ${feedbackData.message || "No message provided"}</p>
                  <p><strong>Submitted By:</strong> ${feedbackData.submitBy}</p>
              </div>
              
              <div class="ticket-details">
                  <h3>Service Details</h3>
                  <p><strong>Ticket ID:</strong> ${service.ticket._id}</p>
                  <p><strong>Client:</strong> ${service.ticket.client?.custName || 'N/A'}</p>
                  <p><strong>Contact Person:</strong> ${service.ticket.contactPerson || 'N/A'}</p>
                  <p><strong>Contact Number:</strong> ${service.ticket.contactNumber || 'N/A'}</p>
                  <p><strong>Product:</strong> ${service.ticket.product}</p>
                  <p><strong>Complaint:</strong> ${service.ticket.details}</p>
                  <p><strong>Service Date:</strong> ${moment(service.allotmentDate).format("DD MMMM YYYY")}</p>
                  <p><strong>Completion Date:</strong> ${moment(service.completionDate).format("DD MMMM YYYY")}</p>
                  <p><strong>Actions Performed:</strong> ${service.remarks || 'N/A'}</p>
              </div>

              <p>Thank you for your service!</p>
              <p>Best regards,<br>The ${service.company?.name || 'Company'} Team</p>
          </div>
          <div class="footer">
              <p>This email was sent to you by ${service.company?.name || 'Company'}.</p>
          </div>
      </body>
      </html>
    `,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(engineerMailOptions, (error, info) => {
      if (error) {
        console.log("Error sending feedback email to engineer: " + error.message);
        reject(error);
      } else {
        console.log("Feedback email sent to engineer: " + info.response);
        resolve(info);
      }
    });
  });
};

/**
 * Send email to company
 */
const sendEmailToCompany = async (service, feedbackData, companyEmail, starRating, ratingLabel) => {
  const companyMailOptions = {
    from: `DAccess <${process.env.EMAIL}>`,
    to: companyEmail,
    subject: `New Feedback Submitted for Ticket #${service.ticket._id}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Feedback Notification</title>
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
              .feedback-details {
                  background-color: #f9f9f9;
                  padding: 15px;
                  border-radius: 5px;
                  margin: 20px 0;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              .ticket-details {
                  background-color: #e8f5e9;
                  padding: 15px;
                  border-radius: 5px;
                  margin: 20px 0;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              .rating {
                  color: #ffc107;
                  font-size: 24px;
              }
              .footer {
                  margin-top: 20px;
                  font-size: 12px;
                  color: #777;
                  text-align: center;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h2>New Feedback Received</h2>
              </div>
              <p>Hello ${service.company?.name || 'Company'} Team,</p>
              <p>New feedback has been submitted for a service provided by your company. Here are the details:</p>
              
              <div class="feedback-details">
                  <h3>Feedback Details</h3>
                  <p><strong>Rating:</strong> <span class="rating">${starRating} (${ratingLabel})</span></p>
                  <p><strong>Message:</strong> ${feedbackData.message || "No message provided"}</p>
                  <p><strong>Submitted By:</strong> ${feedbackData.submitBy}</p>
              </div>
              
              <div class="ticket-details">
                  <h3>Service Details</h3>
                  <p><strong>Ticket ID:</strong> ${service.ticket._id}</p>
                  <p><strong>Client:</strong> ${service.ticket.client?.custName || 'N/A'}</p>
                  <p><strong>Contact Person:</strong> ${service.ticket.contactPerson || 'N/A'}</p>
                  <p><strong>Contact Number:</strong> ${service.ticket.contactNumber || 'N/A'}</p>
                  <p><strong>Product:</strong> ${service.ticket.product}</p>
                  <p><strong>Complaint:</strong> ${service.ticket.details}</p>
                  <p><strong>Assigned Engineer(s):</strong> ${service.allotTo.map(engineer => engineer.name).join(", ")}</p>
                  <p><strong>Service Date:</strong> ${moment(service.allotmentDate).format("DD MMMM YYYY")}</p>
                  <p><strong>Completion Date:</strong> ${moment(service.completionDate).format("DD MMMM YYYY")}</p>
                  <p><strong>Actions Performed:</strong> ${service.remarks || 'N/A'}</p>
              </div>

              <p>This feedback helps us improve our services. Please review and take necessary actions if needed.</p>
              <p>Best regards,<br>The ${service.company?.name || 'Company'} System</p>
          </div>
          <div class="footer">
              <p>This email was sent by the ${service.company?.name || 'Company'} system.</p>
          </div>
      </body>
      </html>
    `,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(companyMailOptions, (error, info) => {
      if (error) {
        console.log("Error sending feedback email to company: " + error.message);
        reject(error);
      } else {
        console.log("Feedback email sent to company: " + info.response);
        resolve(info);
      }
    });
  });
};