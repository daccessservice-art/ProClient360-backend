// mailsService/visitThankYouMailService.js
const transporter = require('./emailTransporter');

const DACCESS_WEBSITE      = 'https://daccess.co.in/';
const DACCESS_LOGO_URL     = 'https://proclient360.com/static/assets/img/daccess.png';
const DACCESS_COMPANY_NAME = 'DAccess Security Systems Pvt. Ltd.';
const DACCESS_DEPARTMENT   = 'Sales & Marketing Department';

// Fallback contact — used only when no exhibition owner is assigned
const DACCESS_FALLBACK_PHONE = '+91 8956307471';
const DACCESS_FALLBACK_NAME  = DACCESS_COMPANY_NAME;

const formatDateIST = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const val = (v) => (v && String(v).trim()) ? String(v).trim() : '—';

// ── Info row ─────────────────────────────────────────────────────────────────
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

// ── Lead badge color ──────────────────────────────────────────────────────────
const leadsColor = (type) => {
  if (type === 'Hot Leads')  return '#dc2626';
  if (type === 'Warm Leads') return '#d97706';
  if (type === 'Cold Leads') return '#2563eb';
  return '#64748b';
};

// ── Main HTML builder ─────────────────────────────────────────────────────────
const buildVisitThankYouHTML = (visitData) => {
  const {
    customerName, companyName, mobile, email, location,
    followUpDate, remark, visitorDesignation, leadsType, product,
    exhibitionName, exhibitionCity, exhibitionDateFrom, exhibitionDateTo,
    ownerName, ownerMobile,   // ✅ dynamic from exhibition owner
  } = visitData;

  const todayFormatted = formatDateIST(new Date());
  const followUp       = followUpDate ? formatDateIST(followUpDate) : null;
  const exDateFrom     = exhibitionDateFrom ? formatDateIST(exhibitionDateFrom) : null;
  const exDateTo       = exhibitionDateTo   ? formatDateIST(exhibitionDateTo)   : null;

  const exhibitionLabel = [
    exhibitionName,
    exhibitionCity ? `— ${exhibitionCity}` : '',
    exDateFrom && exDateTo ? `(${exDateFrom} to ${exDateTo})` : '',
  ].filter(Boolean).join(' ');

  // ✅ Use owner's details if available, else fallback to company defaults
  const contactName   = ownerName   || DACCESS_FALLBACK_NAME;
  const contactPhone  = ownerMobile || DACCESS_FALLBACK_PHONE;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Thank You for Visiting Us – ${DACCESS_COMPANY_NAME}</title>
  <style>
    /* ── Responsive overrides for mobile ── */
    @media only screen and (max-width: 600px) {
      .email-wrapper   { width: 100% !important; border-radius: 0 !important; }
      .email-body      { padding: 20px 16px !important; }
      .header-pad      { padding: 28px 16px 20px !important; }
      .section-pad     { padding: 0 16px 20px !important; }
      .banner-pad      { margin: 0 16px 20px !important; }
      .contact-pad     { margin: 0 16px 24px !important; }
      .footer-pad      { padding: 18px 16px !important; }
      .why-td          { display: block !important; width: 100% !important;
                         padding: 0 0 10px 0 !important; }
      .why-box         { margin-bottom: 10px; }
      .info-label      { width: 110px !important; }
      .logo-img        { width: 120px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;
             font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

<div class="email-wrapper"
     style="max-width:620px;margin:0 auto;background:#ffffff;
            border-radius:14px;overflow:hidden;
            box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <!-- ══════════════════════ HEADER ══════════════════════ -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);">
    <tr>
      <td class="header-pad" style="padding:36px 32px 28px;text-align:center;">

        <a href="${DACCESS_WEBSITE}" target="_blank"
           style="display:inline-block;margin-bottom:16px;text-decoration:none;">
          <img
            class="logo-img"
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

        <!-- Checkmark badge -->
        <div style="margin:18px auto 10px;width:64px;height:64px;
                    border-radius:50%;background:rgba(16,185,129,.15);
                    border:2px solid rgba(16,185,129,.4);
                    font-size:30px;line-height:64px;text-align:center;">
          ✅
        </div>

        <h1 style="margin:10px 0 4px;font-size:24px;font-weight:700;
                   color:#ffffff;line-height:1.3;">
          Thank You for Visiting Us!
        </h1>
        <p style="margin:0;font-size:13.5px;color:#94a3b8;line-height:1.6;">
          We were delighted to meet you at the exhibition.<br/>
          Your visit has been recorded —
          <strong style="color:#e2e8f0;">${todayFormatted}</strong>
        </p>

      </td>
    </tr>
  </table>

  <!-- ══════════════════════ GREETING ══════════════════════ -->
  <div class="email-body section-pad"
       style="padding:30px 32px 0;">
    <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 10px;">
      Dear ${val(customerName)},
    </p>
    <p style="font-size:14.5px;color:#475569;line-height:1.8;margin:0 0 24px;">
      Thank you for taking the time to visit our stall at
      <strong style="color:#1e293b;">${val(exhibitionName)}</strong>
      ${exhibitionCity ? `in <strong style="color:#1e293b;">${exhibitionCity}</strong>` : ''}.
      It was a pleasure meeting you and learning about your requirements.
      We look forward to a fruitful relationship ahead.
    </p>
  </div>

  <!-- ══════════════════════ EXHIBITION BANNER ══════════════════════ -->
  <div class="banner-pad" style="margin:0 32px 26px;">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);
                border-radius:10px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                text-transform:uppercase;color:rgba(255,255,255,.75);font-weight:600;">
        🏛️&nbsp; Exhibition Details
      </p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;line-height:1.5;">
        ${exhibitionLabel || val(exhibitionName)}
      </p>
    </div>
  </div>

  <!-- ══════════════════════ VISIT SUMMARY ══════════════════════ -->
  <div class="section-pad" style="padding:0 32px 26px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 10px;">
      Your Visit Summary
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;
                  border-radius:10px;overflow:hidden;">
      <tbody>
        ${infoRow('👤', 'Name',    val(customerName))}
        ${infoRow('🏢', 'Company', val(companyName))}
        ${visitorDesignation ? infoRow('🪪', 'Designation', val(visitorDesignation)) : ''}
        ${mobile   ? infoRow('📞', 'Mobile',   val(mobile))   : ''}
        ${email    ? infoRow('✉️', 'Email',    val(email))    : ''}
        ${location ? infoRow('📍', 'Location', val(location)) : ''}
        ${product  ? infoRow('📦', 'Product Enquired',
            `<span style="background:#e0f2fe;color:#0369a1;padding:3px 10px;
                          border-radius:20px;font-size:12.5px;font-weight:700;">
              ${val(product)}
             </span>`) : ''}
        ${leadsType ? infoRow('🔥', 'Lead Category',
            `<span style="background:${leadsColor(leadsType)}22;
                          color:${leadsColor(leadsType)};padding:3px 10px;
                          border-radius:20px;font-size:12.5px;font-weight:700;">
              ${val(leadsType)}
             </span>`) : ''}
      </tbody>
    </table>
  </div>

  ${followUp ? `
  <!-- ══════════════════════ FOLLOW-UP CALLOUT ══════════════════════ -->
  <div class="banner-pad" style="margin:0 32px 26px;">
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
        Our team will reach out to discuss your requirements in detail.
        Please keep your phone accessible. 📱
      </p>
    </div>
  </div>
  ` : ''}

  ${remark ? `
  <!-- ══════════════════════ REMARKS ══════════════════════ -->
  <div class="section-pad" style="padding:0 32px 26px;">
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

  <!-- ══════════════════════ WHY DACCESS ══════════════════════ -->
  <div class="section-pad" style="padding:0 32px 28px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 14px;">
      Why Choose DAccess?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${[
          ['🔒', '25+ Years Experience', 'Trusted security solutions since inception'],
          ['⚡', 'End-to-End Solutions',  'From CCTV to Access Control & beyond'],
          ['🛠️', 'Expert Support',        'Dedicated post-sales technical assistance'],
        ].map(([icon, title, desc]) => `
        <td class="why-td"
            style="width:33%;padding:0 5px;vertical-align:top;">
          <div class="why-box"
               style="background:#f8fafc;border:1px solid #e2e8f0;
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

  <!-- ══════════════════════ CONTACT CARD — YELLOW ══════════════════════ -->
  <div class="contact-pad" style="margin:0 32px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);
                  border-radius:12px;overflow:hidden;
                  box-shadow:0 4px 16px rgba(245,158,11,.35);">
      <tr>
        <td style="padding:26px 28px;text-align:center;">

          <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                    text-transform:uppercase;color:rgba(0,0,0,.5);font-weight:700;">
            Have Questions? We're Here
          </p>

          <!-- ✅ Dynamic phone — owner's mobile or company fallback -->
          <p style="margin:0 0 6px;font-size:30px;font-weight:800;
                    color:#1c1917;letter-spacing:1px;line-height:1.2;">
            📞 ${contactPhone}
          </p>

          <!-- ✅ Dynamic name — owner's name or company name -->
          <p style="margin:0;font-size:13.5px;color:#1c1917;line-height:1.7;">
            <strong>${contactName}</strong>
            ${ownerName ? `<br/><span style="font-size:12px;color:rgba(0,0,0,.55);">${DACCESS_DEPARTMENT} &mdash; ${DACCESS_COMPANY_NAME}</span>` : ''}
          </p>

        </td>
      </tr>
    </table>
  </div>

  <!-- ══════════════════════ FOOTER ══════════════════════ -->
  <div class="footer-pad"
       style="background:#f8fafc;border-top:1px solid #e2e8f0;
              padding:22px 32px;text-align:center;
              font-size:12px;color:#94a3b8;line-height:1.8;">

    <a href="${DACCESS_WEBSITE}" target="_blank"
       style="display:inline-block;margin-bottom:10px;text-decoration:none;">
      <img
        class="logo-img"
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

// ── Plain text fallback ───────────────────────────────────────────────────────
const buildPlainText = (visitData) => {
  const {
    customerName, companyName, mobile, email, location,
    followUpDate, remark, visitorDesignation, leadsType, product,
    exhibitionName, exhibitionCity,
    ownerName, ownerMobile,
  } = visitData;

  const followUp     = followUpDate ? formatDateIST(followUpDate) : null;
  const contactName  = ownerName   || DACCESS_FALLBACK_NAME;
  const contactPhone = ownerMobile || DACCESS_FALLBACK_PHONE;

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
    email    ? `Email       : ${val(email)}`    : '',
    location ? `Location    : ${val(location)}` : '',
    product  ? `Product     : ${val(product)}`  : '',
    leadsType ? `Lead Type   : ${val(leadsType)}` : '',
    '',
    followUp ? `Follow-Up Call Scheduled: ${followUp}` : '',
    followUp ? 'Our team will call you on the above date.' : '',
    remark ? `\nNotes: ${val(remark)}` : '',
    '',
    `For queries, contact: ${contactName}`,
    `Phone: ${contactPhone}`,
    `Visit: ${DACCESS_WEBSITE}`,
    `${DACCESS_COMPANY_NAME} — ${DACCESS_DEPARTMENT}`,
    'Available Mon–Sat, 9 AM to 7 PM IST.',
    '',
    `Regards,`,
    `${DACCESS_COMPANY_NAME}`,
  ].filter((l) => l !== null && l !== undefined).join('\n');
};

// ── Send function ─────────────────────────────────────────────────────────────
const sendVisitThankYouEmail = async (visitData) => {
  const { email, exhibitionName } = visitData;

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
    console.error(`[VisitThankYou] ❌ Failed → ${email}:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendVisitThankYouEmail };