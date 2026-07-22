const transporter = require("./emailTransporter");

/**
 * Sends a "Purchase Order Approved" email to the vendor (and CCs the company),
 * matching the same pattern used by sendFeedbackNotification.
 * @param {Object} po - the populated PurchaseOrder doc (needs vendor + company populated)
 */
exports.sendPurchaseOrderApprovalMail = async (po) => {
  try {
    const vendorEmail = po.vendor?.email;
    const companyEmail = po.company?.email;

    if (!vendorEmail && !companyEmail) {
      console.log("[PO-APPROVE-MAIL] No vendor/company email found, skipping mail.");
      return { success: false, error: "No recipient email found" };
    }

    const toList = [vendorEmail, companyEmail].filter(Boolean);

    const mailOptions = {
      from: `DAccess <${process.env.EMAIL}>`,
      to: toList.join(","),
      subject: `Purchase Order Approved - ${po.orderNumber || po._id}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Arial', sans-serif; background-color: #f4f4f4; margin:0; padding:0; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .header { background-color: #198754; color: #fff; padding: 10px; text-align: center; border-radius: 8px 8px 0 0; }
            .details { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h2>Purchase Order Approved</h2></div>
            <p>Hello ${po.vendor?.vendorName || "Vendor"},</p>
            <p>The following Purchase Order has been approved and is now confirmed. Please proceed as per the order details below.</p>
            <div class="details">
              <p><strong>Order Number:</strong> ${po.orderNumber || "N/A"}</p>
              <p><strong>Order Date:</strong> ${po.orderDate ? new Date(po.orderDate).toLocaleDateString("en-GB") : "N/A"}</p>
              <p><strong>Transaction Type:</strong> ${po.transactionType || "N/A"}</p>
              <p><strong>Grand Total:</strong> ₹${Number(po.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              <p><strong>Delivery Address:</strong> ${po.deliveryAddress || "N/A"}</p>
              <p><strong>Expected Delivery Date:</strong> ${po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString("en-GB") : "N/A"}</p>
            </div>
            <p>Best regards,<br>${po.company?.name || "Purchase Team"}</p>
          </div>
          <div class="footer"><p>This is an automated notification for PO ${po.orderNumber || po._id}.</p></div>
        </body>
        </html>
      `,
    };

    return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log("[PO-APPROVE-MAIL] Error sending mail: " + error.message);
          reject(error);
        } else {
          console.log("[PO-APPROVE-MAIL] Sent: " + info.response);
          resolve({ success: true });
        }
      });
    });
  } catch (err) {
    console.log("[PO-APPROVE-MAIL] Unexpected error: " + err.message);
    return { success: false, error: err.message };
  }
};