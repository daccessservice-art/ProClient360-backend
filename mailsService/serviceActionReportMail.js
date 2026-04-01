const moment = require("moment");
const transporter = require("./emailTransporter");

exports.sendServiceActionReportMail = async (service, actionDetails) => {
  try {
    const clientEmail =
      service?.ticket?.client?.email ||
      service?.ticket?.contactPersonEmail ||
      null;

    if (!clientEmail) {
      console.log("No client email found — skipping service action report mail.");
      return;
    }

    const {
      status,
      action,
      stuckReason,
      complateLevel,
      suggestion,
      tentativeNextVisitDate,
      startTime,
      endTime,
      actionByName,
      companyName,
      companyPhone,
    } = actionDetails;

    const clientName   = service?.ticket?.client?.custName || "Valued Customer";
    const ticketId     = service?.ticket?._id || service?.ticket || "N/A";
    const ticketDetail = service?.ticket?.details || "N/A";
    const product      = service?.ticket?.product  || "N/A";
    const serviceType  = service?.serviceType || "N/A";
    const priority     = service?.priority    || "N/A";

    // ── Status colours ──
    const statusColorMap = {
      Completed:  "#16a34a",
      Inprogress: "#2563eb",
      Pending:    "#d97706",
      Stuck:      "#dc2626",
    };
    const statusColor = statusColorMap[status] || "#555";

    // ── Progress ──
    const level    = Number(complateLevel) || 0;
    const barColor =
      level >= 100 ? "#16a34a" :
      level >= 75  ? "#2563eb" :
      level >= 50  ? "#d97706" : "#0891b2";

    // ── Date / time ──
    const visitStart    = moment(startTime).format("DD MMM YYYY, hh:mm A");
    const visitEnd      = moment(endTime).format("hh:mm A");
    const visitDuration = moment(endTime).diff(moment(startTime), "minutes");
    const durationText  =
      visitDuration >= 60
        ? `${Math.floor(visitDuration / 60)}h ${visitDuration % 60}m`
        : `${visitDuration}m`;

    const nextVisitText     = tentativeNextVisitDate
      ? moment(tentativeNextVisitDate).format("DD MMMM YYYY")
      : null;
    const reportGeneratedAt = moment().format("DD MMM YYYY, hh:mm A");

    // ── Progress bar snippet ──
    const progressSection = `
      <div style="margin:6px 0 0;">
        <div style="background:#e5e7eb;border-radius:999px;height:10px;
                    width:100%;max-width:280px;">
          <div style="background:${barColor};height:10px;border-radius:999px;
                      width:${level}%;"></div>
        </div>
        <small style="color:#6b7280;font-size:12px;">${level}% Complete</small>
      </div>`;

    // ── Stuck card ──
    const stuckSection = status === "Stuck" && stuckReason ? `
      <tr>
        <td style="padding:0 0 16px 0;">
          <div style="background:#fef2f2;border:1px solid #fecaca;
                      border-radius:8px;padding:14px 16px;">
            <p style="margin:0 0 6px;font-weight:700;color:#dc2626;font-size:13px;">
              ⚠️ Issue / Stuck Reason
            </p>
            <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">
              ${stuckReason}
            </p>
          </div>
        </td>
      </tr>` : "";

    // ── Suggestion card ──
    const suggestionSection = suggestion ? `
      <tr>
        <td style="padding:0 0 16px 0;">
          <div style="background:#fffbeb;border:1px solid #fde68a;
                      border-radius:8px;padding:14px 16px;">
            <p style="margin:0 0 6px;font-weight:700;color:#92400e;font-size:13px;">
              💡 Technician Suggestion / Remark
            </p>
            <p style="margin:0;color:#78350f;font-size:14px;line-height:1.6;">
              ${suggestion}
            </p>
          </div>
        </td>
      </tr>` : "";

    // ── Next visit card ──
    const nextVisitSection = nextVisitText ? `
      <tr>
        <td style="padding:0 0 16px 0;">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;
                      border-radius:8px;padding:14px 16px;">
            <p style="margin:0 0 4px;font-weight:700;color:#1e40af;font-size:13px;">
              📅 Tentative Next Visit Date
            </p>
            <p style="margin:0;color:#1d4ed8;font-size:18px;
                      font-weight:800;letter-spacing:0.5px;">
              ${nextVisitText}
            </p>
            <p style="margin:4px 0 0;color:#3b82f6;font-size:12px;">
              Our team will visit on or around this date.
              We will confirm before the visit.
            </p>
          </div>
        </td>
      </tr>` : "";

    // ── Reusable table row ──
    const row = (label, value, bg = "#ffffff") => `
      <tr style="background:${bg};">
        <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#6b7280;
                   width:42%;border-bottom:1px solid #f3f4f6;">
          ${label}
        </td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;
                   border-bottom:1px solid #f3f4f6;">
          ${value}
        </td>
      </tr>`;

    // ── "What Happens Next" cells — dynamic by status ──
    const whatNextMap = {
      Completed: `
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">✅</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Service Complete
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            Your issue has been resolved
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">⭐</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Share Feedback
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            Help us improve our service
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📞</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Still Need Help?
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            Call us at ${companyPhone || "our support line"}
          </p>
        </td>`,

      Inprogress: `
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">🔧</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Work In Progress
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            ${level}% of work completed
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📅</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Next Visit Scheduled
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            ${nextVisitText || "To be confirmed"}
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📱</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Stay Updated
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            You will receive updates by email
          </p>
        </td>`,

      Stuck: `
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">⚠️</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Issue Identified
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            Our team is working on it
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">🔄</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Resolution In Progress
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            We will update you shortly
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📞</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Contact Support
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            ${companyPhone || "Call our support team"}
          </p>
        </td>`,

      Pending: `
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📋</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Ticket Registered
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            Work will begin shortly
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">👨‍🔧</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Technician Assigned
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            ${actionByName || "Our team"} is on the case
          </p>
        </td>
        <td style="text-align:center;padding:8px 6px;">
          <div style="font-size:24px;">📅</div>
          <p style="margin:6px 0 0;font-size:12px;color:#374151;font-weight:600;">
            Visit Planned
          </p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">
            ${nextVisitText || "To be confirmed"}
          </p>
        </td>`,
    };

    const whatNextCells = whatNextMap[status] || whatNextMap["Pending"];

    // ══════════════════════════════════════════════════
    //  FULL EMAIL HTML
    // ══════════════════════════════════════════════════
    const mailOptions = {
      from: `${companyName || "Support Team"} <${process.env.EMAIL}>`,
      to: clientEmail,
      subject: `Service Report — ${status} | ${product} | Ticket #${ticketId}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Service Action Report</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;
             background:#f3f4f6;color:#111827;">

  <div style="max-width:640px;margin:28px auto;border-radius:12px;
              overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

    <!-- ══ HEADER ══ -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%);
                padding:28px 32px 22px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0 0 2px;color:rgba(255,255,255,0.7);
                      font-size:12px;letter-spacing:1.5px;
                      text-transform:uppercase;">
              ${companyName || "Service Team"}
            </p>
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
              Service Action Report
            </h1>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <span style="display:inline-block;background:${statusColor};
                         color:#fff;font-size:12px;font-weight:700;
                         padding:5px 14px;border-radius:999px;
                         text-transform:uppercase;letter-spacing:1px;">
              ${status}
            </span>
          </td>
        </tr>
      </table>
      <!-- Progress bar -->
      <div style="margin-top:18px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:rgba(255,255,255,0.8);font-size:12px;">
            Work Completion
          </span>
          <span style="color:#ffffff;font-size:12px;font-weight:700;">
            ${level}%
          </span>
        </div>
        <div style="background:rgba(255,255,255,0.25);border-radius:999px;height:8px;">
          <div style="background:#ffffff;height:8px;border-radius:999px;
                      width:${level}%;"></div>
        </div>
      </div>
    </div>

    <!-- ══ TICKET SUMMARY STRIP ══ -->
    <div style="background:#1e40af;padding:10px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:rgba(255,255,255,0.75);font-size:12px;">
            Ticket ID:
            <strong style="color:#fff;">#${ticketId}</strong>
          </td>
          <td style="color:rgba(255,255,255,0.75);font-size:12px;
                     text-align:center;">
            Service Type:
            <strong style="color:#fff;">${serviceType}</strong>
          </td>
          <td style="color:rgba(255,255,255,0.75);font-size:12px;
                     text-align:right;">
            Priority:
            <strong style="color:${
              priority === "High"   ? "#fca5a5" :
              priority === "Medium" ? "#fde68a" : "#86efac"
            };">
              ${priority}
            </strong>
          </td>
        </tr>
      </table>
    </div>

    <!-- ══ MAIN BODY ══ -->
    <div style="background:#ffffff;padding:28px 32px 8px;">

      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
        Dear <strong>${clientName}</strong>,<br/>
        Our technician has completed a service visit and submitted a work report.
        Please find the complete details below.
      </p>

      <!-- Service Details Table -->
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#9ca3af;
                letter-spacing:1.2px;text-transform:uppercase;">
        Service Details
      </p>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e5e7eb;border-radius:8px;
                    overflow:hidden;margin-bottom:20px;">
        <tbody>
          ${row("Product / Equipment", product, "#f9fafb")}
          ${row("Complaint / Issue",   ticketDetail, "#ffffff")}
          ${row("Current Status",
            `<span style="color:${statusColor};font-weight:700;">${status}</span>`,
            "#f9fafb")}
          ${row("Work Done",
            action || (status === "Stuck" ? "— (See stuck reason below)" : "-"),
            "#ffffff")}
          ${row("Visit Date & Time",
            `${visitStart} → ${visitEnd}
             <span style="color:#6b7280;">(${durationText})</span>`,
            "#f9fafb")}
          ${row("Technician", actionByName || "Our Technician", "#ffffff")}
          ${status === "Inprogress" || status === "Completed" ? `
          <tr style="background:#f9fafb;">
            <td style="padding:10px 14px;font-size:13px;font-weight:600;
                       color:#6b7280;border-bottom:1px solid #f3f4f6;">
              Work Progress
            </td>
            <td style="padding:10px 14px;border-bottom:1px solid #f3f4f6;">
              ${progressSection}
            </td>
          </tr>` : ""}
        </tbody>
      </table>

      <!-- Dynamic cards -->
      <table width="100%" cellpadding="0" cellspacing="0">
        ${stuckSection}
        ${suggestionSection}
        ${nextVisitSection}
      </table>

    </div>

    <!-- ══ WHAT HAPPENS NEXT ══ -->
    <div style="background:#f9fafb;padding:20px 32px;
                border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#9ca3af;
                letter-spacing:1.2px;text-transform:uppercase;">
        What Happens Next
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${whatNextCells}
        </tr>
      </table>
    </div>

    <!-- ══ FOOTER ══ -->
    <div style="background:#1e3a5f;padding:20px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:700;">
              ${companyName || "Support Team"}
            </p>
            ${companyPhone
              ? `<p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;">
                   📞 ${companyPhone}
                 </p>`
              : ""}
          </td>
          <td style="text-align:right;vertical-align:top;">
            <p style="margin:0;color:rgba(255,255,255,0.45);font-size:11px;">
              Report generated on<br/>${reportGeneratedAt}
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:rgba(255,255,255,0.35);font-size:11px;
                border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
        This is an auto-generated Service Action Report. Please do not reply
        to this email. For assistance, contact us directly at the number above.
      </p>
    </div>

  </div>
</body>
</html>`,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Service action report mail error:", err.message);
      } else {
        console.log("Service action report mail sent:", info.response);
      }
    });
  } catch (error) {
    console.error("sendServiceActionReportMail error:", error);
  }
};