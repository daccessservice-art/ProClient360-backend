const transporter = require("./emailTransporter");

/**
 * Sends survey engineer report notification email.
 *
 * Recipients:
 *   - Customer (SENDER_EMAIL from lead)
 *   - Assigned Sales Employee (assignedTo.email)
 *   - Fixed internal email: dhananjay@daccess.co
 */
exports.surveyEngineerReportMail = async ({
  lead,
  surveyEngineer,
  status,
  cancelReason,
  surveyDate,
}) => {
  try {
    // ── Resolve recipients ────────────────────────────────────────────────────
    const recipients = [];
    if (lead.SENDER_EMAIL && lead.SENDER_EMAIL.trim() !== "") {
      recipients.push(lead.SENDER_EMAIL.trim());
    }
    if (lead.assignedTo && lead.assignedTo.email) {
      recipients.push(lead.assignedTo.email.trim());
    }
    recipients.push("dhananjay@daccess.co");
    const uniqueRecipients = [...new Set(recipients)];

    // ── Base URL for file downloads ───────────────────────────────────────────
    const BASE_URL = process.env.FRONTEND_URL || process.env.REACT_APP_API_URL || "https://proclient360.com";
    const API_URL  = process.env.API_URL      || "https://proclient360.com";

    // Build full download URL from a stored file path like /uploads/survey-reports/xxx.docx
    const buildFileUrl = (filePath) => {
      if (!filePath) return null;
      if (filePath.startsWith("http")) return filePath;
      return `${API_URL}${filePath}`;
    };

    const reportUrl  = buildFileUrl(lead.surveyReport?.reportFile);
    const drawingUrl = buildFileUrl(lead.surveyReport?.drawingFile);
    const boqUrl     = buildFileUrl(lead.surveyReport?.boqFile);

    // ── Format dates ──────────────────────────────────────────────────────────
    const formatDateTime = (d) => {
      if (!d) return "N/A";
      try {
        return new Date(d).toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
          timeZone: "Asia/Kolkata",
        });
      } catch { return "N/A"; }
    };

    const submittedAt       = formatDateTime(new Date());
    const surveyScheduledAt = lead.surveyDetails?.dateTime
      ? formatDateTime(lead.surveyDetails.dateTime) : "Not scheduled";
    const actualSurveyDate  = surveyDate ? formatDateTime(surveyDate) : submittedAt;

    // ── Status helpers ────────────────────────────────────────────────────────
    const isSuccess         = status === "success";
    const subjectLine       = isSuccess
      ? `✅ Survey Completed — ${lead.SENDER_COMPANY || "Lead"} | ${lead.QUERY_PRODUCT_NAME || ""}`
      : `❌ Survey Cancelled — ${lead.SENDER_COMPANY || "Lead"} | ${lead.QUERY_PRODUCT_NAME || ""}`;

    const statusBadgeColor  = isSuccess ? "#16a34a" : "#dc2626";
    const statusBadgeBg     = isSuccess ? "#f0fdf4" : "#fef2f2";
    const statusBorderColor = isSuccess ? "#22c55e" : "#ef4444";
    const statusIcon        = isSuccess ? "✅" : "❌";
    const statusLabel       = isSuccess ? "Survey Completed Successfully" : "Survey Cancelled";

    // ── Download button helper (email-safe table-based button) ────────────────
    const downloadButton = (url, label, bgColor, icon) => {
      if (!url) {
        return `<span style="display:inline-block;background:#e2e8f0;color:#94a3b8;
          padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;">
          ${icon} ${label} — Not uploaded
        </span>`;
      }
      return `
        <a href="${url}" target="_blank" rel="noopener noreferrer"
          style="display:inline-block;background:${bgColor};color:#ffffff;
          padding:8px 16px;border-radius:6px;text-decoration:none;
          font-size:12px;font-weight:700;letter-spacing:0.3px;
          border:none;cursor:pointer;">
          ${icon} Download ${label}
        </a>`;
    };

    // ── Files section (success only) ──────────────────────────────────────────
    const filesSection = isSuccess ? `
      <tr>
        <td style="padding:20px 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#f0fdf4;border:1.5px solid #86efac;
            border-radius:10px;overflow:hidden;">

            <!-- Section header -->
            <tr style="background:#dcfce7;">
              <td style="padding:12px 18px;">
                <strong style="color:#166534;font-size:14px;">
                  📎 Survey Documents — Download Links
                </strong>
                <p style="margin:4px 0 0;font-size:12px;color:#4ade80;">
                  Click the buttons below to download each document directly.
                </p>
              </td>
            </tr>

            <!-- Document cards row -->
            <tr>
              <td style="padding:16px 18px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>

                    <!-- Survey Report (Word) -->
                    <td width="33%" style="padding:0 6px 0 0;vertical-align:top;">
                      <table width="100%" cellpadding="0" cellspacing="0"
                        style="background:#dbeafe;border:1px solid #93c5fd;
                        border-radius:8px;overflow:hidden;">
                        <tr style="background:#bfdbfe;">
                          <td style="padding:10px 12px;text-align:center;">
                            <div style="font-size:28px;line-height:1;">📄</div>
                            <div style="font-size:11px;font-weight:700;
                              color:#1e40af;margin-top:4px;">SURVEY REPORT</div>
                            <div style="font-size:10px;color:#3b82f6;">.doc / .docx</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 12px;text-align:center;">
                            ${reportUrl
                              ? `<a href="${reportUrl}" target="_blank" rel="noopener noreferrer"
                                  style="display:block;background:#2563eb;color:#fff;
                                  padding:8px 10px;border-radius:6px;text-decoration:none;
                                  font-size:12px;font-weight:700;">
                                  ⬇️ Download Report
                                </a>`
                              : `<span style="display:block;background:#e2e8f0;color:#94a3b8;
                                  padding:8px 10px;border-radius:6px;font-size:11px;
                                  font-weight:600;">Not uploaded</span>`
                            }
                          </td>
                        </tr>
                      </table>
                    </td>

                    <!-- Drawing (PDF) -->
                    <td width="33%" style="padding:0 3px;vertical-align:top;">
                      <table width="100%" cellpadding="0" cellspacing="0"
                        style="background:#fee2e2;border:1px solid #fca5a5;
                        border-radius:8px;overflow:hidden;">
                        <tr style="background:#fecaca;">
                          <td style="padding:10px 12px;text-align:center;">
                            <div style="font-size:28px;line-height:1;">📋</div>
                            <div style="font-size:11px;font-weight:700;
                              color:#991b1b;margin-top:4px;">DRAWING</div>
                            <div style="font-size:10px;color:#ef4444;">.pdf</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 12px;text-align:center;">
                            ${drawingUrl
                              ? `<a href="${drawingUrl}" target="_blank" rel="noopener noreferrer"
                                  style="display:block;background:#dc2626;color:#fff;
                                  padding:8px 10px;border-radius:6px;text-decoration:none;
                                  font-size:12px;font-weight:700;">
                                  ⬇️ Download Drawing
                                </a>`
                              : `<span style="display:block;background:#e2e8f0;color:#94a3b8;
                                  padding:8px 10px;border-radius:6px;font-size:11px;
                                  font-weight:600;">Not uploaded</span>`
                            }
                          </td>
                        </tr>
                      </table>
                    </td>

                    <!-- BOQ (Excel) -->
                    <td width="33%" style="padding:0 0 0 6px;vertical-align:top;">
                      <table width="100%" cellpadding="0" cellspacing="0"
                        style="background:#dcfce7;border:1px solid #86efac;
                        border-radius:8px;overflow:hidden;">
                        <tr style="background:#bbf7d0;">
                          <td style="padding:10px 12px;text-align:center;">
                            <div style="font-size:28px;line-height:1;">📊</div>
                            <div style="font-size:11px;font-weight:700;
                              color:#166534;margin-top:4px;">BOQ</div>
                            <div style="font-size:10px;color:#22c55e;">.xls / .xlsx</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 12px;text-align:center;">
                            ${boqUrl
                              ? `<a href="${boqUrl}" target="_blank" rel="noopener noreferrer"
                                  style="display:block;background:#16a34a;color:#fff;
                                  padding:8px 10px;border-radius:6px;text-decoration:none;
                                  font-size:12px;font-weight:700;">
                                  ⬇️ Download BOQ
                                </a>`
                              : `<span style="display:block;background:#e2e8f0;color:#94a3b8;
                                  padding:8px 10px;border-radius:6px;font-size:11px;
                                  font-weight:600;">Not uploaded</span>`
                            }
                          </td>
                        </tr>
                      </table>
                    </td>

                  </tr>
                </table>

                <!-- Note -->
                <p style="margin:12px 0 0;font-size:11px;color:#6b7280;text-align:center;">
                  🔒 These links are direct download links from ProClient360 server.<br/>
                  If a link does not open, please login to
                  <a href="${BASE_URL}" style="color:#2563eb;">ProClient360</a>
                  and download from the Survey Engineer Dashboard.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>` : "";

    // ── Cancel reason section ─────────────────────────────────────────────────
    const cancelSection = !isSuccess ? `
      <tr>
        <td style="padding:20px 24px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#fef2f2;border:1.5px solid #fecaca;
            border-radius:10px;overflow:hidden;">
            <tr style="background:#fee2e2;">
              <td style="padding:12px 18px;">
                <strong style="color:#991b1b;font-size:14px;">
                  📝 Cancellation Reason
                </strong>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 18px;font-size:14px;color:#7f1d1d;
                line-height:1.6;white-space:pre-wrap;word-break:break-word;">
                ${cancelReason || "No reason provided."}
              </td>
            </tr>
          </table>
        </td>
      </tr>` : "";

    // ── Full HTML email ───────────────────────────────────────────────────────
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Survey Report — ProClient360</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 12px;">
  <tr>
    <td align="center">

      <!-- Card -->
      <table width="620" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:12px;overflow:hidden;
        box-shadow:0 4px 20px rgba(0,0,0,0.10);max-width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);
            padding:28px 24px 22px;text-align:center;">
            <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="48" height="48"
              style="display:block;margin:0 auto 14px;border-radius:8px;"/>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
              ${statusIcon} ${statusLabel}
            </h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.80);font-size:13px;">
              Survey Engineer Report — ProClient360
            </p>
          </td>
        </tr>

        <!-- Status Badge -->
        <tr>
          <td style="padding:20px 24px 0;">
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:${statusBadgeBg};border:1.5px solid ${statusBorderColor};
              border-radius:8px;">
              <tr>
                <td style="padding:12px 18px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:20px;padding-right:10px;">${statusIcon}</td>
                      <td>
                        <div style="font-weight:700;color:${statusBadgeColor};font-size:15px;">
                          ${statusLabel}
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-top:2px;">
                          Submitted at: ${submittedAt} (IST)
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Customer & Lead Details -->
        <tr>
          <td style="padding:20px 24px 0;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#334155;
              border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
              🏢 Customer &amp; Lead Details
            </h3>
            <table width="100%" cellpadding="8" cellspacing="0"
              style="border:1px solid #e2e8f0;border-radius:8px;
              overflow:hidden;font-size:13px;">
              <tr style="background:#f8fafc;">
                <td style="width:38%;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Company Name</td>
                <td style="color:#1e293b;font-weight:700;border-bottom:1px solid #f1f5f9;">${lead.SENDER_COMPANY || "—"}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Contact Person</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${lead.SENDER_NAME || "—"}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Mobile</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${lead.SENDER_MOBILE || "—"}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Email</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${lead.SENDER_EMAIL || "—"}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Product</td>
                <td style="color:#2563eb;font-weight:600;border-bottom:1px solid #f1f5f9;">${lead.QUERY_PRODUCT_NAME || "—"}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Lead Source</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${lead.SOURCE || "—"}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Lead Status</td>
                <td style="border-bottom:1px solid #f1f5f9;">
                  <span style="background:${
                    lead.STATUS === 'Won'     ? '#16a34a' :
                    lead.STATUS === 'Lost'    ? '#dc2626' :
                    lead.STATUS === 'Ongoing' ? '#2563eb' : '#d97706'
                  };color:white;padding:2px 10px;border-radius:4px;
                  font-size:11px;font-weight:700;">${lead.STATUS || "—"}</span>
                </td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Address</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">
                  ${[lead.SENDER_ADDRESS, lead.SENDER_CITY, lead.SENDER_STATE,
                     lead.SENDER_PINCODE, lead.SENDER_COUNTRY_ISO]
                    .filter(Boolean).join(", ") || "—"}
                </td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;">Assigned Sales Person</td>
                <td style="color:#1e293b;font-weight:600;">${lead.assignedTo?.name || "—"}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Survey Information -->
        <tr>
          <td style="padding:20px 24px 0;">
            <h3 style="margin:0 0 12px;font-size:14px;color:#334155;
              border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
              🗓️ Survey Information
            </h3>
            <table width="100%" cellpadding="8" cellspacing="0"
              style="border:1px solid #e2e8f0;border-radius:8px;
              overflow:hidden;font-size:13px;">
              <tr style="background:#f8fafc;">
                <td style="width:38%;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Survey Engineer</td>
                <td style="color:#1e293b;font-weight:700;border-bottom:1px solid #f1f5f9;">${surveyEngineer?.name || "—"}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Scheduled Survey Date</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${surveyScheduledAt}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Actual Survey Date</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">${actualSurveyDate}</td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Survey Needed?</td>
                <td style="border-bottom:1px solid #f1f5f9;">
                  <span style="background:${lead.surveyNeeded === 'yes' ? '#dbeafe' : '#f1f5f9'};
                    color:${lead.surveyNeeded === 'yes' ? '#1d4ed8' : '#64748b'};
                    padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;">
                    ${lead.surveyNeeded === 'yes' ? 'Yes' : lead.surveyNeeded === 'no' ? 'No' : '—'}
                  </span>
                </td>
              </tr>
              <tr style="background:#f8fafc;">
                <td style="color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Project Size</td>
                <td style="color:#1e293b;border-bottom:1px solid #f1f5f9;">
                  <span style="background:${
                    lead.projectSize === 'big'    ? '#fee2e2' :
                    lead.projectSize === 'medium' ? '#fef9c3' : '#dbeafe'
                  };color:${
                    lead.projectSize === 'big'    ? '#991b1b' :
                    lead.projectSize === 'medium' ? '#854d0e' : '#1d4ed8'
                  };padding:2px 10px;border-radius:4px;font-size:11px;
                  font-weight:600;text-transform:capitalize;">
                    ${lead.projectSize || "—"}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;">Requirement Type</td>
                <td style="color:#1e293b;text-transform:capitalize;">
                  ${lead.requirementType ? `${lead.requirementType} (${lead.requirementMode || "—"})` : "—"}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Documents or Cancel Reason -->
        ${filesSection}
        ${cancelSection}

        <!-- CTA -->
        <tr>
          <td style="padding:24px 24px 0;text-align:center;">
            <a href="${BASE_URL}"
              style="display:inline-block;
              background:linear-gradient(135deg,#1e3a8a,#2563eb);
              color:#ffffff;padding:12px 30px;border-radius:8px;
              text-decoration:none;font-weight:700;font-size:14px;">
              📋 View in ProClient360
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px;text-align:center;background:#f8fafc;
            border-top:1px solid #e2e8f0;margin-top:24px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              This is an automated notification from
              <strong style="color:#64748b;">ProClient360</strong>.
              Please do not reply to this email.
            </p>
            <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">
              © 2025 ProClient360. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
      <!-- End Card -->

    </td>
  </tr>
</table>

</body>
</html>`;

    // ── Send ──────────────────────────────────────────────────────────────────
    const mailOptions = {
      from:    `ProClient360 <${process.env.EMAIL}>`,
      to:      uniqueRecipients.join(", "),
      subject: subjectLine,
      html,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Error sending survey report email:", error);
      } else {
        console.log(
          `✅ Survey report email sent [${status}] to: ${uniqueRecipients.join(", ")} — ${info.response}`
        );
      }
    });

  } catch (err) {
    console.error("❌ surveyEngineerReportMail error:", err);
  }
};