// mailsService/visitThankYouMailService.js
const transporter = require('./emailTransporter');

const DACCESS_WEBSITE      = 'https://daccess.co.in/';
const DACCESS_LOGO_URL     = 'https://proclient360.com/static/assets/img/daccess.png';
const DACCESS_COMPANY_NAME = 'DAccess Security Systems Pvt. Ltd.';
const DACCESS_DEPARTMENT   = 'Sales & Marketing Department';

const DACCESS_FALLBACK_PHONE = '+91 8956307471';
const DACCESS_FALLBACK_NAME  = DACCESS_COMPANY_NAME;

const formatDateIST = (date) => {
  if (!date) return null;
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return null;
  }
};

const val = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return '—';
  const s = String(v).trim();
  return s || '—';
};

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

const leadsColor = (type) => {
  if (type === 'Hot Leads')  return '#dc2626';
  if (type === 'Warm Leads') return '#d97706';
  if (type === 'Cold Leads') return '#2563eb';
  return '#64748b';
};

const buildVisitThankYouHTML = (visitData) => {
  const customerName       = val(visitData.customerName);
  const companyName        = val(visitData.companyName);
  const mobile             = visitData.mobile             ? val(visitData.mobile)             : null;
  const email              = visitData.email              ? val(visitData.email)              : null;
  const location           = visitData.location           ? val(visitData.location)           : null;
  const remark             = visitData.remark             ? val(visitData.remark)             : null;
  const visitorDesignation = visitData.visitorDesignation ? val(visitData.visitorDesignation) : null;
  const leadsType          = visitData.leadsType          ? val(visitData.leadsType)          : null;
  const product            = visitData.product            ? val(visitData.product)            : null;

  const rawExhibitionName = visitData.exhibitionName;
  const exhibitionName    = (rawExhibitionName && typeof rawExhibitionName === 'string' && rawExhibitionName.trim())
                              ? rawExhibitionName.trim() : 'our Exhibition';

  const exhibitionCity     = (visitData.exhibitionCity && typeof visitData.exhibitionCity === 'string')
                               ? visitData.exhibitionCity.trim() : null;
  const exhibitionDateFrom = visitData.exhibitionDateFrom || null;
  const exhibitionDateTo   = visitData.exhibitionDateTo   || null;

  const ownerName   = (visitData.ownerName   && typeof visitData.ownerName   === 'string') ? visitData.ownerName.trim()   : null;
  const ownerMobile = (visitData.ownerMobile && typeof visitData.ownerMobile === 'string') ? visitData.ownerMobile.trim() : null;

  const todayFormatted = formatDateIST(new Date()) || '';
  const followUp       = visitData.followUpDate ? formatDateIST(visitData.followUpDate) : null;
  const exDateFrom     = exhibitionDateFrom     ? formatDateIST(exhibitionDateFrom)     : null;
  const exDateTo       = exhibitionDateTo       ? formatDateIST(exhibitionDateTo)       : null;

  const exhibitionLabel = [
    exhibitionName,
    exhibitionCity         ? `— ${exhibitionCity}`             : '',
    exDateFrom && exDateTo ? `(${exDateFrom} to ${exDateTo})` : '',
  ].filter(Boolean).join(' ');

  const contactName  = ownerName   || DACCESS_FALLBACK_NAME;
  const contactPhone = ownerMobile || DACCESS_FALLBACK_PHONE;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Thank You for Visiting Us – ${DACCESS_COMPANY_NAME}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-wrapper { width: 100% !important; border-radius: 0 !important; }
      .email-body    { padding: 20px 16px !important; }
      .header-pad    { padding: 28px 16px 20px !important; }
      .section-pad   { padding: 0 16px 20px !important; }
      .banner-pad    { margin: 0 16px 20px !important; }
      .contact-pad   { margin: 0 16px 24px !important; }
      .footer-pad    { padding: 18px 16px !important; }
      .why-td        { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
      .why-box       { margin-bottom: 10px; }
      .logo-img      { width: 120px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

<div class="email-wrapper"
     style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.10);">

  <!-- HEADER -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);">
    <tr>
      <td class="header-pad" style="padding:36px 32px 28px;text-align:center;">
        <a href="${DACCESS_WEBSITE}" target="_blank" style="display:inline-block;margin-bottom:16px;text-decoration:none;">
          <img class="logo-img" src="${DACCESS_LOGO_URL}" alt="${DACCESS_COMPANY_NAME}"
               width="150" height="auto"
               style="display:block;margin:0 auto;filter:brightness(0) invert(1);max-height:56px;object-fit:contain;border:0;outline:none;"/>
        </a>
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#e94560;font-weight:700;">
          <a href="${DACCESS_WEBSITE}" target="_blank" style="color:#e94560;text-decoration:none;">${DACCESS_COMPANY_NAME}</a>
        </p>
        <div style="margin:18px auto 10px;width:64px;height:64px;border-radius:50%;background:rgba(16,185,129,.15);border:2px solid rgba(16,185,129,.4);font-size:30px;line-height:64px;text-align:center;">
          &#x2705;
        </div>
        <h1 style="margin:10px 0 4px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">
          Thank You for Visiting Us!
        </h1>
        <p style="margin:0;font-size:13.5px;color:#94a3b8;line-height:1.6;">
          We were delighted to meet you at the exhibition.<br/>
          Your visit has been recorded &mdash;
          <strong style="color:#e2e8f0;">${todayFormatted}</strong>
        </p>
      </td>
    </tr>
  </table>

  <!-- GREETING -->
  <div class="email-body section-pad" style="padding:30px 32px 0;">
    <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 10px;">
      Dear ${customerName},
    </p>
    <p style="font-size:14.5px;color:#475569;line-height:1.8;margin:0 0 24px;">
      Thank you for taking the time to visit our stall at
      <strong style="color:#1e293b;">${exhibitionName}</strong>
      ${exhibitionCity ? `in <strong style="color:#1e293b;">${exhibitionCity}</strong>` : ''}.
      It was a pleasure meeting you and learning about your requirements.
      We look forward to a fruitful relationship ahead.
    </p>
  </div>

  <!-- EXHIBITION BANNER -->
  <div class="banner-pad" style="margin:0 32px 26px;">
    <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0284c7 100%);border-radius:10px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.75);font-weight:600;">
        &#x1F3DB;&nbsp; Exhibition Details
      </p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;line-height:1.5;">
        ${exhibitionLabel}
      </p>
    </div>
  </div>

  <!-- VISIT SUMMARY -->
  <div class="section-pad" style="padding:0 32px 26px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin:0 0 10px;">
      Your Visit Summary
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <tbody>
        ${infoRow('&#x1F464;', 'Name',    customerName)}
        ${infoRow('&#x1F3E2;', 'Company', companyName)}
        ${visitorDesignation ? infoRow('&#x1FAA6;', 'Designation', visitorDesignation) : ''}
        ${mobile   ? infoRow('&#x1F4DE;', 'Mobile',   mobile)   : ''}
        ${email    ? infoRow('&#x2709;',  'Email',    email)    : ''}
        ${location ? infoRow('&#x1F4CD;', 'Location', location) : ''}
        ${product  ? infoRow('&#x1F4E6;', 'Product Enquired',
            `<span style="background:#e0f2fe;color:#0369a1;padding:3px 10px;border-radius:20px;font-size:12.5px;font-weight:700;">${product}</span>`) : ''}
        ${leadsType ? infoRow('&#x1F525;', 'Lead Category',
            `<span style="background:${leadsColor(leadsType)}22;color:${leadsColor(leadsType)};padding:3px 10px;border-radius:20px;font-size:12.5px;font-weight:700;">${leadsType}</span>`) : ''}
      </tbody>
    </table>
  </div>

  ${followUp ? `
  <!-- FOLLOW-UP CALLOUT -->
  <div class="banner-pad" style="margin:0 32px 26px;">
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 20px;">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c2410c;font-weight:700;">
        &#x1F4C5;&nbsp; Follow-Up Call Scheduled
      </p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#9a3412;line-height:1.4;">${followUp}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#b45309;line-height:1.6;">
        Our team will reach out to discuss your requirements in detail. Please keep your phone accessible.
      </p>
    </div>
  </div>
  ` : ''}

  ${remark ? `
  <!-- REMARKS -->
  <div class="section-pad" style="padding:0 32px 26px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin:0 0 10px;">
      &#x1F4DD; Notes from Our Team
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;font-size:14px;color:#334155;line-height:1.75;white-space:pre-wrap;">
      ${remark}
    </div>
  </div>
  ` : ''}

  <!-- WHY DACCESS -->
  <div class="section-pad" style="padding:0 32px 28px;">
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin:0 0 14px;">
      Why Choose DAccess?
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td class="why-td" style="width:33%;padding:0 5px;vertical-align:top;">
          <div class="why-box" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center;">
            <div style="font-size:26px;margin-bottom:6px;">&#x1F512;</div>
            <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#1e293b;">25+ Years Experience</p>
            <p style="margin:0;font-size:11.5px;color:#64748b;line-height:1.5;">Trusted security solutions since inception</p>
          </div>
        </td>
        <td class="why-td" style="width:33%;padding:0 5px;vertical-align:top;">
          <div class="why-box" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center;">
            <div style="font-size:26px;margin-bottom:6px;">&#x26A1;</div>
            <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#1e293b;">End-to-End Solutions</p>
            <p style="margin:0;font-size:11.5px;color:#64748b;line-height:1.5;">From CCTV to Access Control &amp; beyond</p>
          </div>
        </td>
        <td class="why-td" style="width:33%;padding:0 5px;vertical-align:top;">
          <div class="why-box" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center;">
            <div style="font-size:26px;margin-bottom:6px;">&#x1F6E0;</div>
            <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#1e293b;">Expert Support</p>
            <p style="margin:0;font-size:11.5px;color:#64748b;line-height:1.5;">Dedicated post-sales technical assistance</p>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- CONTACT CARD -->
  <div class="contact-pad" style="margin:0 32px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(245,158,11,.35);">
      <tr>
        <td style="padding:26px 28px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(0,0,0,.5);font-weight:700;">
            Have Questions? We're Here
          </p>
          <p style="margin:0 0 6px;font-size:30px;font-weight:800;color:#1c1917;letter-spacing:1px;line-height:1.2;">
            &#x1F4DE; ${contactPhone}
          </p>
          <p style="margin:0;font-size:13.5px;color:#1c1917;line-height:1.7;">
            <strong>${contactName}</strong>
            ${ownerName ? `<br/><span style="font-size:12px;color:rgba(0,0,0,.55);">${DACCESS_DEPARTMENT} &mdash; ${DACCESS_COMPANY_NAME}</span>` : ''}
          </p>
        </td>
      </tr>
    </table>
  </div>

  <!-- FOOTER -->
  <div class="footer-pad" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:22px 32px;text-align:center;font-size:12px;color:#94a3b8;line-height:1.8;">
    <a href="${DACCESS_WEBSITE}" target="_blank" style="display:inline-block;margin-bottom:10px;text-decoration:none;">
      <img class="logo-img" src="${DACCESS_LOGO_URL}" alt="${DACCESS_COMPANY_NAME}"
           width="90" height="auto"
           style="display:block;margin:0 auto;opacity:0.45;object-fit:contain;border:0;outline:none;"/>
    </a>
    <strong style="color:#64748b;">
      <a href="${DACCESS_WEBSITE}" target="_blank" style="color:#64748b;text-decoration:none;">${DACCESS_COMPANY_NAME}</a>
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
  const customerName       = val(visitData.customerName);
  const companyName        = val(visitData.companyName);
  const mobile             = visitData.mobile             ? val(visitData.mobile)             : null;
  const location           = visitData.location           ? val(visitData.location)           : null;
  const remark             = visitData.remark             ? val(visitData.remark)             : null;
  const visitorDesignation = visitData.visitorDesignation ? val(visitData.visitorDesignation) : null;
  const leadsType          = visitData.leadsType          ? val(visitData.leadsType)          : null;
  const product            = visitData.product            ? val(visitData.product)            : null;

  const rawExhibitionName = visitData.exhibitionName;
  const exhibitionName    = (rawExhibitionName && typeof rawExhibitionName === 'string' && rawExhibitionName.trim())
                              ? rawExhibitionName.trim() : 'our Exhibition';
  const exhibitionCity    = (visitData.exhibitionCity && typeof visitData.exhibitionCity === 'string')
                              ? visitData.exhibitionCity.trim() : null;

  const ownerName   = (visitData.ownerName   && typeof visitData.ownerName   === 'string') ? visitData.ownerName.trim()   : null;
  const ownerMobile = (visitData.ownerMobile && typeof visitData.ownerMobile === 'string') ? visitData.ownerMobile.trim() : null;

  const followUp     = visitData.followUpDate ? formatDateIST(visitData.followUpDate) : null;
  const contactName  = ownerName   || DACCESS_FALLBACK_NAME;
  const contactPhone = ownerMobile || DACCESS_FALLBACK_PHONE;

  return [
    `Dear ${customerName},`,
    '',
    `Thank you for visiting our stall at ${exhibitionName}${exhibitionCity ? ` — ${exhibitionCity}` : ''}.`,
    '',
    '── YOUR VISIT DETAILS ──',
    `Name        : ${customerName}`,
    `Company     : ${companyName}`,
    visitorDesignation ? `Designation : ${visitorDesignation}` : null,
    mobile    ? `Mobile      : ${mobile}`    : null,
    location  ? `Location    : ${location}`  : null,
    product   ? `Product     : ${product}`   : null,
    leadsType ? `Lead Type   : ${leadsType}` : null,
    '',
    followUp ? `Follow-Up Call Scheduled: ${followUp}` : null,
    followUp ? 'Our team will call you on the above date.' : null,
    remark ? `\nNotes: ${remark}` : null,
    '',
    `For queries, contact : ${contactName}`,
    `Phone                : ${contactPhone}`,
    `Website              : ${DACCESS_WEBSITE}`,
    `${DACCESS_COMPANY_NAME} — ${DACCESS_DEPARTMENT}`,
    'Available Mon–Sat, 9 AM to 7 PM IST.',
    '',
    'Regards,',
    `${DACCESS_COMPANY_NAME}`,
  ].filter((l) => l !== null && l !== undefined).join('\n');
};

// ── Send function ─────────────────────────────────────────────────────────────
const sendVisitThankYouEmail = async (visitData) => {
  const toEmail       = visitData.email;
  const rawName       = visitData.exhibitionName;
  const exhibitionName = (rawName && typeof rawName === 'string' && rawName.trim())
                           ? rawName.trim() : 'our Exhibition';

  // Guard: no email
  if (!toEmail || typeof toEmail !== 'string' || !toEmail.trim()) {
    console.log('[VisitThankYou] Skipped — no email address provided.');
    return { success: false, reason: 'no_email' };
  }

  // Guard: EMAIL env var must exist
  if (!process.env.EMAIL) {
    console.error('[VisitThankYou] ❌ process.env.EMAIL is not set — cannot send email.');
    return { success: false, error: 'missing_env_EMAIL' };
  }

  console.log(`[VisitThankYou] Preparing email  → ${toEmail.trim()}`);
  console.log(`[VisitThankYou] Exhibition       : ${exhibitionName}`);
  console.log(`[VisitThankYou] Owner name       : ${visitData.ownerName  || 'none (using fallback)'}`);
  console.log(`[VisitThankYou] Owner mobile     : ${visitData.ownerMobile || 'none (using fallback)'}`);

  // Single try/catch wraps BOTH build + send together
  // (splitting them into two separate try/catches was the root cause — 
  //  a build error would return early and sendMail was never reached)
  try {
    const mailOptions = {
      from:    `"${DACCESS_COMPANY_NAME}" <${process.env.EMAIL}>`,
      to:      toEmail.trim(),
      subject: `Thank You for Visiting Us at ${exhibitionName} | ${DACCESS_COMPANY_NAME}`,
      html:    buildVisitThankYouHTML(visitData),
      text:    buildPlainText(visitData),
    };

    await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) reject(error);
        else resolve(info);
      });
    });

    console.log(`[VisitThankYou] ✅ Email sent successfully → ${toEmail.trim()}`);
    return { success: true };

  } catch (err) {
    console.error(`[VisitThankYou] ❌ Failed → ${toEmail.trim()}`);
    console.error(`[VisitThankYou] Error code    : ${err.code    || 'N/A'}`);
    console.error(`[VisitThankYou] Error message : ${err.message}`);
    console.error(`[VisitThankYou] Response      : ${err.response || 'N/A'}`);
    return { success: false, error: err.message };
  }
};

module.exports = { sendVisitThankYouEmail };