// mailsService/visitThankYouMailService.js
const transporter = require('./emailTransporter');

const DACCESS_WEBSITE       = 'https://daccess.co.in/';
const DACCESS_LOGO_URL      = 'https://proclient360.com/static/assets/img/daccess.png';
const DACCESS_CONTACT_PHONE = '+91 8956307471';
const DACCESS_COMPANY_NAME  = 'DAccess Security Systems Pvt. Ltd.';
const DACCESS_DEPARTMENT    = 'Sales & Marketing Department';

const formatDateIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const val = (v) => (v && String(v).trim()) ? String(v).trim() : '—';

// ── Info row helper ──────────────────────────────────────────────────────────
const infoRow = (icon, label, value) => `
  <tr>
    <td style="padding:10px 14px;vertical-align:top;width:140px;
               font-size:12.5px;color:#6b7280;font-weight:500;
               border-bottom:1px solid #f1f5f9;white-space:nowrap;">
      ${icon}&nbsp; ${label}
    </td>
    <td style="padding:10px 14px;vertical-align:top;
               font-size:13.5px;color:#1e293b;font-weight:600;
               border-bottom:1px solid #f1f5f9;">
      ${value}
    </td>
  </tr>`;

// ── Lead badge color ─────────────────────────────────────────────────────────
const leadsColor = (type) => {
  if (type === 'Hot Leads')  return '#dc2626';
  if (type === 'Warm Leads') return '#d97706';
  if (type === 'Cold Leads') return '#2563eb';
  return '#64748b';
};

// ── Main HTML builder ────────────────────────────────────────────────────────
const buildVisitThankYouHTML = (visitData) => {
  const {
    customerName, companyName, mobile, email, location,
    followUpDate, remark, visitorDesignation, leadsType, product,
    exhibitionName, exhibitionCity, exhibitionDateFrom, exhibitionDateTo,
  } = visitData;

  const todayFormatted  = formatDateIST(new Date());
  const followUp        = followUpDate ? formatDateIST(followUpDate) : null;
  const exDateFrom      = exhibitionDateFrom ? formatDateIST(exhibitionDateFrom) : null;
  const exDateTo        = exhibitionDateTo   ? formatDateIST(exhibitionDateTo)   : null;

  const exhibitionLabel = [
    exhibitionName,
    exhibitionCity   ? `— ${exhibitionCity}` : '',
    exDateFrom && exDateTo ? `(${exDateFrom} to ${exDateTo})` : '',
  ].filter(Boolean).join(' ');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Thank You for Visiting Us – ${DACCESS_COMPANY_NAME}</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;
             font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

<div style="max-width:620px;margin:0 auto;background:#ffffff;
            border-radius:14px;overflow:hidden;
            box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <!-- ═══════════════════════════ HEADER ═══════════════════════════ -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);">
    <tr>
      <td style="padding:36px 32px 28px;text-align:center;">

        <a href="${DACCESS_WEBSITE}" target="_blank"
           style="display:inline-block;margin-bottom:16px;text-decoration:none;">
          <img
            src="${DACCESS_LOGO_URL}"
            alt="${DACCESS_COMPANY_NAME}"
            width="150" height="auto"
            style="display:block;margin:0 auto;
                   filter:brightness(0) invert(1);
                   max-height:56px;object-fit:contain;border:0;outline:none;"
          />
        </a>

        <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;
                  text-transform:uppercase;color:#e94560;font-weight:700;">
          <a href="${DACCESS_WEBSITE}" target="_blank"
             style="color:#e94560;text-decoration:none;">
            ${DACCESS_COMPANY_NAME}
          </a>
        </p>

        <!-- Big checkmark circle -->
        <div style="margin:18px auto 10px;width:64px;height:64px;
                    border-radius:50%;background:rgba(16,185,129,.15);
                    border:2px solid rgba(16,185,129,.4);
                    display:flex;align-items:center;justify-content:center;
                    font-size:30px;line-height:64px;text-align:center;">
          ✅
        </div>

        <h1 style="margin:10px 0 4px;font-size:24px;font-weight:700;
                   color:#ffffff;line-height:1.3;">
          Thank You for Visiting Us!
        </h1>
        <p style="margin:0;font-size:13.5px;color:#94a3b8;line-height:1.6;">
          We were delighted to meet you at the exhibition.<br/>
          Your visit has been recorded — <strong style="color:#e2e8f0;">${todayFormatted}</strong>
        </p>

      </td>
    </tr>
  </table>

  <!-- ═══════════════════════════ GREETING ═══════════════════════════ -->
  <div style="padding:30px 32px 0;">
    <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 10px;">
      Dear ${val(customerName)},
    </p>
    <p style="font-size:14.5px;color:#475569;line-height:1.8;margin:0 0 24px;">
      Thank you for taking the time to visit our stall at
      <strong style="color:#1e293b;">${val(exhibitionName)}</strong>${exhibitionCity ? ` in <strong style="color:#1e293b;">${exhibitionCity}</strong>` : ''}.
      It was a pleasure meeting you and learning more about your requirements.
      We value this opportunity to connect with you and look forward to a
      fruitful relationship.
    </p>
  </div>

  <!-- ═══════════════════════════ EXHIBITION BANNER ═══════════════════════════ -->
  <div style="margin:0 32px 26px;">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);
                border-radius:10px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                text-transform:uppercase;color:rgba(255,255,255,.7);font-weight:600;">
        🏛️&nbsp; Exhibition Details
      </p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;line-height:1.4;">
        ${exhibitionLabel || val(exhibitionName)}
      </p>
    </div>
  </div>

  <!-- ═══════════════════════════ VISITOR DETAILS ═══════════════════════════ -->
  <div style="padding:0 32px 26px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 10px;">
      Your Visit Summary
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;
                  border-radius:10px;overflow:hidden;">
      <tbody>
        ${infoRow('👤', 'Name',        val(customerName))}
        ${infoRow('🏢', 'Company',     val(companyName))}
        ${visitorDesignation ? infoRow('🪪', 'Designation', val(visitorDesignation)) : ''}
        ${mobile  ? infoRow('📞', 'Mobile',  val(mobile))  : ''}
        ${email   ? infoRow('✉️', 'Email',   val(email))   : ''}
        ${location ? infoRow('📍', 'Location', val(location)) : ''}
        ${product ? infoRow('📦', 'Product Enquired',
            `<span style="background:#e0f2fe;color:#0369a1;padding:3px 10px;
                          border-radius:20px;font-size:12.5px;font-weight:700;">
              ${val(product)}
             </span>`) : ''}
        ${leadsType ? infoRow('🔥', 'Lead Category',
            `<span style="background:${leadsColor(leadsType)}22;
                          color:${leadsColor(leadsType)};
                          padding:3px 10px;border-radius:20px;
                          font-size:12.5px;font-weight:700;">
              ${val(leadsType)}
             </span>`) : ''}
      </tbody>
    </table>
  </div>

  ${followUp ? `
  <!-- ═══════════════════════════ FOLLOW-UP CALLOUT ═══════════════════════════ -->
  <div style="margin:0 32px 26px;">
    <div style="background:#fff7ed;border:1px solid #fed7aa;
                border-radius:10px;padding:18px 20px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                text-transform:uppercase;color:#c2410c;font-weight:700;">
        📅&nbsp; Follow-Up Call Scheduled
      </p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#9a3412;line-height:1.4;">
        ${followUp}
      </p>
      <p style="margin:6px 0 0;font-size:13px;color:#b45309;line-height:1.6;">
        Our team will reach out to you on this date to discuss your requirements in detail.
        Please keep your phone accessible. 📱
      </p>
    </div>
  </div>
  ` : ''}

  ${remark ? `
  <!-- ═══════════════════════════ REMARKS ═══════════════════════════ -->
  <div style="padding:0 32px 26px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 10px;">
      📝 Notes from Our Team
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;
                padding:14px 16px;font-size:14px;color:#334155;
                line-height:1.75;white-space:pre-wrap;">
      ${val(remark)}
    </div>
  </div>
  ` : ''}

  <!-- ═══════════════════════════ WHY US ═══════════════════════════ -->
  <div style="padding:0 32px 28px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 14px;">
      Why Choose DAccess?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${[
          ['🔒', '25+ Years Experience', 'Trusted security solutions since inception'],
          ['⚡', 'End-to-End Solutions', 'From CCTV to Access Control & beyond'],
          ['🛠️', 'Expert Support', 'Dedicated post-sales technical assistance'],
        ].map(([icon, title, desc]) => `
        <td style="width:33%;padding:0 6px;vertical-align:top;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;
                      border-radius:10px;padding:14px 12px;text-align:center;">
            <div style="font-size:26px;margin-bottom:6px;">${icon}</div>
            <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;
                      color:#1e293b;">${title}</p>
            <p style="margin:0;font-size:11.5px;color:#64748b;
                      line-height:1.5;">${desc}</p>
          </div>
        </td>`).join('')}
      </tr>
    </table>
  </div>

  <!-- ═══════════════════════════ CONTACT CARD ═══════════════════════════ -->
  <div style="margin:0 32px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#0f172a,#1e3a5f);
                  border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:26px 28px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                    text-transform:uppercase;color:#94a3b8;font-weight:600;">
            Have Questions? We're Here
          </p>
          <p style="margin:0 0 10px;font-size:28px;font-weight:700;
                    color:#ffffff;letter-spacing:1px;">
            📞 ${DACCESS_CONTACT_PHONE}
          </p>
          <p style="margin:0;font-size:13px;color:#cbd5e1;line-height:1.7;">
            <a href="${DACCESS_WEBSITE}" target="_blank"
               style="color:#ffffff;text-decoration:none;font-weight:700;">
              ${DACCESS_COMPANY_NAME}
            </a><br/>
            <span style="color:#94a3b8;">${DACCESS_DEPARTMENT}</span>
          </p>
        </td>
      </tr>
    </table>
  </div>

  <!-- ═══════════════════════════ FOOTER ═══════════════════════════ -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;
              padding:22px 32px;text-align:center;
              font-size:12px;color:#94a3b8;line-height:1.8;">
    <a href="${DACCESS_WEBSITE}" target="_blank"
       style="display:inline-block;margin-bottom:10px;text-decoration:none;">
      <img
        src="${DACCESS_LOGO_URL}"
        alt="${DACCESS_COMPANY_NAME}"
        width="90" height="auto"
        style="display:block;margin:0 auto;opacity:0.45;
               object-fit:contain;border:0;outline:none;"
      />
    </a>
    <strong style="color:#64748b;">
      <a href="${DACCESS_WEBSITE}" target="_blank"
         style="color:#64748b;text-decoration:none;">
        ${DACCESS_COMPANY_NAME}
      </a>
    </strong><br/>
    &copy; ${new Date().getFullYear()} All rights reserved.<br/>
    This email was sent as a confirmation of your visit at our exhibition stall.<br/>
    If you believe this was sent in error, please reply to this email.
  </div>

</div>
</body>
</html>`.trim();
};

// ── Plain text fallback ──────────────────────────────────────────────────────
const buildPlainText = (visitData) => {
  const {
    customerName, companyName, mobile, email, location,
    followUpDate, remark, visitorDesignation, leadsType, product,
    exhibitionName, exhibitionCity,
  } = visitData;

  const followUp = followUpDate ? formatDateIST(followUpDate) : null;

  return [
    `Dear ${val(customerName)},`,
    '',
    `Thank you for visiting our stall at ${val(exhibitionName)}${exhibitionCity ? ` — ${exhibitionCity}` : ''}.`,
    '',
    '── YOUR VISIT DETAILS ──',
    `Name        : ${val(customerName)}`,
    `Company     : ${val(companyName)}`,
    visitorDesignation ? `Designation : ${val(visitorDesignation)}` : '',
    `Mobile      : ${val(mobile)}`,
    email   ? `Email       : ${val(email)}`    : '',
    location ? `Location    : ${val(location)}` : '',
    product  ? `Product     : ${val(product)}`  : '',
    leadsType ? `Lead Type   : ${val(leadsType)}` : '',
    '',
    followUp ? `Follow-Up Call Scheduled: ${followUp}` : '',
    followUp ? 'Our team will call you on the above date.' : '',
    remark ? `\nNotes: ${val(remark)}` : '',
    '',
    `For any queries, call us: ${DACCESS_CONTACT_PHONE}`,
    `Visit: ${DACCESS_WEBSITE}`,
    `${DACCESS_COMPANY_NAME} — ${DACCESS_DEPARTMENT}`,
    'Available Mon–Sat, 9 AM to 7 PM IST.',
    '',
    `Regards,`,
    `${DACCESS_COMPANY_NAME}`,
  ].filter(line => line !== null && line !== undefined).join('\n');
};

// ── Send function ────────────────────────────────────────────────────────────
const sendVisitThankYouEmail = async (visitData) => {
  const { email, customerName, exhibitionName } = visitData;

  if (!email || !email.trim()) {
    console.log('[VisitThankYou] No email address — skipping send.');
    return { success: false, reason: 'no_email' };
  }

  try {
    const mailOptions = {
      from:    `"${DACCESS_COMPANY_NAME}" <${process.env.EMAIL}>`,
      to:      email,
      subject: `Thank You for Visiting Us at ${val(exhibitionName)} | ${DACCESS_COMPANY_NAME}`,
      html:    buildVisitThankYouHTML(visitData),
      text:    buildPlainText(visitData),
    };

    await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) reject(error);
        else resolve(info);
      });
    });

    console.log(`[VisitThankYou] ✅ Email sent → ${email}`);
    return { success: true };
  } catch (err) {
    console.error(`[VisitThankYou] ❌ Failed to send → ${email}:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendVisitThankYouEmail };