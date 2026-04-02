/**
 * lowRatingAlertService.js
 *
 * Triggered automatically when a customer submits a 1-star rating.
 * Sends alert emails to:
 *   1. All assigned engineers on the service
 *   2. All management employees matching MANAGEMENT_DESIGNATION_NAMES
 *
 * Uses the same nodemailer transporter pattern as your existing mail services.
 */

const nodemailer = require("nodemailer");

// ─── Reuse your existing transporter config ────────────────────────────────
const createTransporter = () => {
    return nodemailer.createTransport({
        host:   process.env.SMTP_HOST   || "smtp.gmail.com",
        port:   parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER || process.env.EMAIL_USER,
            pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
        },
    });
};

// ─── Build star HTML for emails ───────────────────────────────────────────
const buildStarHtml = (rating) => {
    const filled = "★".repeat(rating);
    const empty  = "☆".repeat(5 - rating);
    return `<span style="color:#f44336;font-size:22px;">${filled}</span><span style="color:#ccc;font-size:22px;">${empty}</span>`;
};

// ─── Engineer Alert Email ─────────────────────────────────────────────────
const buildEngineerEmailHtml = ({ rating, message, service, isNewFeedback, previousRating }) => {
    const clientName    = service.ticket?.client?.custName || "N/A";
    const contactPerson = service.ticket?.contactPerson    || "N/A";
    const product       = service.ticket?.product          || "N/A";
    const complaint     = service.ticket?.details          || "N/A";
    const engineerNames = (service.allotTo || []).map(e => e.name || e).join(", ") || "N/A";
    const actionText    = isNewFeedback ? "New 1-Star Feedback Received" : "Feedback Updated to 1 Star";
    const prevNote      = !isNewFeedback && previousRating
        ? `<p style="margin:4px 0;color:#666;font-size:13px;">Previous Rating: ${previousRating} ⭐ → Now: 1 ⭐</p>`
        : "";

    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#f44336 0%,#b71c1c 100%);padding:28px 32px;">
            <h2 style="margin:0;color:#fff;font-size:22px;">
              ⚠️ ${actionText}
            </h2>
            <p style="margin:6px 0 0;color:#ffcdd2;font-size:14px;">
              Action Required — Please review and respond to this feedback
            </p>
          </td>
        </tr>

        <!-- Rating Banner -->
        <tr>
          <td style="background:#fff3f3;padding:18px 32px;border-bottom:1px solid #ffcdd2;text-align:center;">
            <div style="font-size:14px;color:#b71c1c;font-weight:bold;margin-bottom:4px;">CUSTOMER RATING</div>
            ${buildStarHtml(rating)}
            <div style="font-size:13px;color:#666;margin-top:6px;">1 out of 5 stars</div>
            ${prevNote}
          </td>
        </tr>

        <!-- Service Details -->
        <tr>
          <td style="padding:24px 32px;">
            <h3 style="margin:0 0 16px;font-size:16px;color:#333;border-bottom:2px solid #f44336;padding-bottom:8px;">
              Service Details
            </h3>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${[
                  ["Client",          clientName],
                  ["Contact Person",  contactPerson],
                  ["Product",         product],
                  ["Complaint",       complaint],
                  ["Assigned Engineers", engineerNames],
              ].map(([label, val]) => `
              <tr>
                <td style="padding:6px 0;color:#666;font-size:13px;width:160px;font-weight:bold;">${label}</td>
                <td style="padding:6px 0;color:#333;font-size:13px;">${val}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>

        <!-- Customer Feedback Message -->
        <tr>
          <td style="padding:0 32px 24px;">
            <div style="background:#fff3f3;border-left:4px solid #f44336;border-radius:0 6px 6px 0;padding:14px 18px;">
              <div style="font-size:12px;font-weight:bold;color:#b71c1c;margin-bottom:6px;">CUSTOMER COMMENT</div>
              <div style="font-size:14px;color:#333;font-style:italic;">"${message || 'No comment provided'}"</div>
            </div>
          </td>
        </tr>

        <!-- Action Box -->
        <tr>
          <td style="padding:0 32px 28px;">
            <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:14px 18px;">
              <div style="font-size:13px;color:#f57c00;font-weight:bold;">📋 What You Should Do:</div>
              <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#555;line-height:1.8;">
                <li>Review the service visit and identify what went wrong</li>
                <li>Contact the customer to acknowledge and resolve the issue</li>
                <li>Discuss with your team lead for any support needed</li>
                <li>Update the service log with corrective actions taken</li>
              </ul>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#999;">
              This is an automated alert from your CRM system. Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─── Management Alert Email ───────────────────────────────────────────────
const buildManagementEmailHtml = ({ rating, message, service, isNewFeedback, previousRating }) => {
    const clientName    = service.ticket?.client?.custName || "N/A";
    const contactPerson = service.ticket?.contactPerson    || "N/A";
    const contactNumber = service.ticket?.contactNumber    || "N/A";
    const product       = service.ticket?.product          || "N/A";
    const complaint     = service.ticket?.details          || "N/A";
    const engineerNames = (service.allotTo || []).map(e => e.name || e).join(", ") || "N/A";
    const actionText    = isNewFeedback ? "1-Star Customer Rating Alert" : "1-Star Rating Update Alert";
    const prevNote      = !isNewFeedback && previousRating
        ? `<div style="font-size:12px;color:#888;margin-top:4px;">Previously: ${previousRating} ⭐ → Now: 1 ⭐</div>`
        : "";

    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:30px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#c62828 0%,#7f0000 100%);padding:28px 32px;">
            <h2 style="margin:0;color:#fff;font-size:22px;">🚨 ${actionText}</h2>
            <p style="margin:6px 0 0;color:#ef9a9a;font-size:13px;">
              Management Notification — Immediate Attention Required
            </p>
          </td>
        </tr>

        <!-- Rating Banner -->
        <tr>
          <td style="background:#ffebee;padding:20px 32px;border-bottom:1px solid #ffcdd2;text-align:center;">
            <div style="font-size:13px;color:#b71c1c;font-weight:bold;letter-spacing:1px;">CUSTOMER SATISFACTION ALERT</div>
            <div style="margin:10px 0;">
              ${buildStarHtml(rating)}
            </div>
            <div style="font-size:13px;color:#c62828;font-weight:bold;">1 / 5 Stars — Poor Experience</div>
            ${prevNote}
          </td>
        </tr>

        <!-- Two-column Details -->
        <tr>
          <td style="padding:24px 32px;">
            <h3 style="margin:0 0 16px;font-size:15px;color:#333;border-bottom:2px solid #c62828;padding-bottom:8px;">
              Service & Customer Information
            </h3>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${[
                  ["Client Name",    clientName],
                  ["Contact Person", contactPerson],
                  ["Contact No.",    contactNumber],
                  ["Product",        product],
                  ["Complaint",      complaint],
                  ["Assigned Engineers", `<strong style="color:#c62828;">${engineerNames}</strong>`],
              ].map(([label, val]) => `
              <tr>
                <td style="padding:7px 0;color:#666;font-size:13px;width:165px;font-weight:bold;">${label}:</td>
                <td style="padding:7px 0;color:#333;font-size:13px;">${val}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>

        <!-- Customer Feedback Message -->
        <tr>
          <td style="padding:0 32px 24px;">
            <div style="background:#ffebee;border-left:4px solid #c62828;border-radius:0 6px 6px 0;padding:14px 18px;">
              <div style="font-size:12px;font-weight:bold;color:#b71c1c;margin-bottom:8px;">📝 CUSTOMER FEEDBACK</div>
              <div style="font-size:14px;color:#333;font-style:italic;">"${message || 'No comment provided'}"</div>
            </div>
          </td>
        </tr>

        <!-- Recommended Actions for Management -->
        <tr>
          <td style="padding:0 32px 28px;">
            <div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:6px;padding:16px 20px;">
              <div style="font-size:13px;color:#2e7d32;font-weight:bold;margin-bottom:8px;">✅ Recommended Management Actions:</div>
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#555;line-height:2;">
                <li>Review the assigned engineer(s) performance on this service</li>
                <li>Follow up with the customer directly to restore trust</li>
                <li>Conduct a root-cause analysis of what went wrong</li>
                <li>Consider whether additional training or support is needed</li>
                <li>Update service notes with your corrective action plan</li>
              </ul>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f9fa;padding:16px 32px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#999;">
              This is an automated management alert from your CRM. Sent to designated management personnel only.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// ─── Main Export Function ─────────────────────────────────────────────────
/**
 * sendLowRatingAlert
 * @param {Object} params
 * @param {number}   params.rating               - The rating value (1)
 * @param {string}   params.message              - Customer feedback message
 * @param {Object}   params.service              - Populated service document
 * @param {string}   params.submitBy             - "Employee" | "Customer"
 * @param {Array}    params.managementEmployees  - Array of management employee docs { name, email }
 * @param {boolean}  params.isNewFeedback        - true = new, false = updated
 * @param {number}   [params.previousRating]     - Previous rating (for updates)
 */
const sendLowRatingAlert = async (params) => {
    const { rating, message, service, managementEmployees = [], isNewFeedback, previousRating } = params;

    // Only fire for 1-star
    if (parseInt(rating) !== 1) {
        return { success: true, skipped: true, reason: "Rating is not 1 star" };
    }

    const transporter = createTransporter();
    const errors = [];
    const sent   = [];

    const subject = isNewFeedback
        ? `🚨 1-Star Customer Rating Received — ${service.ticket?.client?.custName || 'Client'}`
        : `🚨 1-Star Rating Update — ${service.ticket?.client?.custName || 'Client'}`;

    // ── Email assigned engineers ─────────────────────────────────────────
    const engineers = service.allotTo || [];
    for (const engineer of engineers) {
        const email = engineer.email;
        if (!email) continue;

        try {
            await transporter.sendMail({
                from:    `"ProClient CRM" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
                to:      email,
                subject: `[Action Required] ${subject}`,
                html:    buildEngineerEmailHtml({ rating, message, service, isNewFeedback, previousRating }),
            });
            sent.push({ type: 'engineer', name: engineer.name, email });
            console.log(`✅ Low-rating alert sent to engineer: ${engineer.name} <${email}>`);
        } catch (err) {
            errors.push({ type: 'engineer', name: engineer.name, email, error: err.message });
            console.error(`❌ Failed to send alert to engineer ${engineer.name}:`, err.message);
        }
    }

    // ── Email management employees ────────────────────────────────────────
    for (const mgmt of managementEmployees) {
        const email = mgmt.email;
        if (!email) continue;

        try {
            await transporter.sendMail({
                from:    `"ProClient CRM" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
                to:      email,
                subject: `[Management Alert] ${subject}`,
                html:    buildManagementEmailHtml({ rating, message, service, isNewFeedback, previousRating }),
            });
            sent.push({ type: 'management', name: mgmt.name, email, designation: mgmt.designation?.name });
            console.log(`✅ Low-rating alert sent to management: ${mgmt.name} <${email}>`);
        } catch (err) {
            errors.push({ type: 'management', name: mgmt.name, email, error: err.message });
            console.error(`❌ Failed to send alert to management ${mgmt.name}:`, err.message);
        }
    }

    console.log(`📧 Low-rating alert summary: ${sent.length} sent, ${errors.length} failed`);

    return {
        success: errors.length === 0,
        sent,
        errors,
        totalSent:   sent.length,
        totalFailed: errors.length,
    };
};

module.exports = { sendLowRatingAlert };