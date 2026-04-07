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
    <td class="info-icon-td" style="padding:12px 10px 12px 16px;vertical-align:top;width:36px;border-bottom:1px solid #f0f4f8;">
      <span style="font-size:16px;line-height:1;">${icon}</span>
    </td>
    <td class="info-label-td" style="padding:12px 8px 12px 0;vertical-align:top;width:120px;
               font-size:11px;color:#8fa3b8;font-weight:700;letter-spacing:.6px;
               text-transform:uppercase;border-bottom:1px solid #f0f4f8;white-space:nowrap;">
      ${label}
    </td>
    <td class="info-value-td" style="padding:12px 16px 12px 0;vertical-align:top;
               font-size:14px;color:#1a2e45;font-weight:600;
               border-bottom:1px solid #f0f4f8;line-height:1.5;">
      ${value}
    </td>
  </tr>`;

const leadsColor = (type) => {
  if (type === 'Hot Leads')  return { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' };
  if (type === 'Warm Leads') return { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
  if (type === 'Cold Leads') return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
  return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
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
    exhibitionCity         ? `&#8226; ${exhibitionCity}`                    : '',
    exDateFrom && exDateTo ? `&#8226; ${exDateFrom} &ndash; ${exDateTo}`   : '',
  ].filter(Boolean).join('&nbsp;&nbsp;');

  const contactName  = ownerName   || DACCESS_FALLBACK_NAME;
  const contactPhone = ownerMobile || DACCESS_FALLBACK_PHONE;
  const lc = leadsType ? leadsColor(leadsType) : null;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Thank You for Visiting – ${DACCESS_COMPANY_NAME}</title>
  <style>
    * { box-sizing:border-box; }
    body, html { margin:0; padding:0; width:100% !important; }
    body { background:#edf2f7; font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; }
    img  { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }

    @media only screen and (max-width:620px) {
      .email-shell    { width:100% !important; border-radius:0 !important; }
      .header-cell    { padding:32px 20px 28px !important; }
      .logo-img       { width:100px !important; }
      .main-heading   { font-size:24px !important; }
      .sub-text       { font-size:13px !important; }
      .body-pad       { padding:22px 16px 0 !important; }
      .section-pad    { padding:18px 16px 0 !important; }
      .banner-cell    { padding:14px 16px !important; }
      .footer-cell    { padding:20px 16px !important; }
      .contact-cell   { padding:22px 16px !important; }
      .contact-phone  { font-size:20px !important; }
      .info-label-td  { display:none !important; width:0 !important; padding:0 !important; overflow:hidden !important; max-height:0 !important; }
      .why-td         { display:block !important; width:100% !important; padding:0 0 10px 0 !important; }
      .why-box        { margin:0 !important; }
      .greeting-name  { font-size:17px !important; }
      .greeting-body  { font-size:14px !important; }
    }
    @media only screen and (max-width:400px) {
      .main-heading  { font-size:20px !important; }
      .contact-phone { font-size:17px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#edf2f7;">

<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background:#edf2f7;">
  <tr>
    <td align="center" style="padding:24px 10px;">

      <table class="email-shell" border="0" cellpadding="0" cellspacing="0"
             style="width:600px;max-width:600px;background:#ffffff;
                    border-radius:20px;overflow:hidden;
                    box-shadow:0 8px 40px rgba(0,0,0,.13);">

        <!-- ===== HEADER — Teal/Emerald gradient ===== -->
        <tr>
          <td class="header-cell" align="center"
              style="padding:44px 32px 0;
                     background:linear-gradient(135deg,#0d9488 0%,#0f766e 45%,#065f46 100%);">

            <a href="${DACCESS_WEBSITE}" target="_blank" style="text-decoration:none;display:block;margin-bottom:18px;">
              <img class="logo-img" src="${DACCESS_LOGO_URL}" alt="${DACCESS_COMPANY_NAME}"
                   width="120" height="auto"
                   style="display:block;margin:0 auto;max-height:50px;object-fit:contain;
                          filter:brightness(0) invert(1);"/>
            </a>

            <p style="margin:0 0 20px;font-size:10px;letter-spacing:4px;
                      text-transform:uppercase;color:rgba(255,255,255,.60);font-weight:700;">
              ${DACCESS_COMPANY_NAME}
            </p>

            <!-- Checkmark circle -->
            <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;">
              <tr>
                <td style="width:72px;height:72px;border-radius:50%;
                           background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.35);
                           text-align:center;vertical-align:middle;font-size:34px;line-height:72px;">
                  &#x2705;
                </td>
              </tr>
            </table>

            <h1 class="main-heading"
                style="margin:0 0 14px;font-size:30px;font-weight:800;
                       color:#ffffff;line-height:1.25;letter-spacing:-.3px;">
              Thank You for Visiting Us!
            </h1>

            <p class="sub-text"
               style="margin:0 0 0;font-size:14px;color:rgba(255,255,255,.78);line-height:1.75;">
              We were delighted to meet you at the exhibition.<br/>
              Your visit has been recorded &mdash;
              <strong style="color:#ffffff;">${todayFormatted}</strong>
            </p>

            <!-- SVG wave -->
            <div style="margin-top:28px;line-height:0;font-size:0;">
              <svg viewBox="0 0 600 44" xmlns="http://www.w3.org/2000/svg"
                   style="display:block;width:100%;height:44px;">
                <path d="M0,22 C100,48 200,0 300,22 C400,44 500,4 600,22 L600,44 L0,44 Z"
                      fill="#ffffff"/>
              </svg>
            </div>
          </td>
        </tr>

        <!-- ===== GREETING ===== -->
        <tr>
          <td class="body-pad" style="padding:26px 32px 0;">
            <p class="greeting-name"
               style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 10px;">
              Dear ${customerName},
            </p>
            <p class="greeting-body"
               style="font-size:15px;color:#4a5568;line-height:1.85;margin:0;">
              Thank you for visiting our stall at
              <strong style="color:#0d9488;">${exhibitionName}</strong>${exhibitionCity ? ` in <strong style="color:#0f172a;">${exhibitionCity}</strong>` : ''}.
              It was a genuine pleasure meeting you and understanding your requirements.
              We look forward to a long and fruitful partnership ahead.
            </p>
          </td>
        </tr>

        <!-- ===== EXHIBITION BANNER ===== -->
        <tr>
          <td class="section-pad" style="padding:20px 32px 0;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0"
                   style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);
                          border:1.5px solid #6ee7b7;border-radius:14px;">
              <tr>
                <td class="banner-cell" style="padding:16px 22px;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:2.5px;
                            text-transform:uppercase;color:#059669;font-weight:800;">
                    &#x1F3DB;&nbsp; Exhibition Details
                  </p>
                  <p style="margin:0;font-size:15px;font-weight:700;
                            color:#064e3b;line-height:1.6;">
                    ${exhibitionLabel}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ===== VISIT SUMMARY ===== -->
        <tr>
          <td class="section-pad" style="padding:20px 32px 0;">
            <p style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;
                      color:#94a3b8;font-weight:800;margin:0 0 12px;">
              &#x1F4CB;&nbsp; Your Visit Summary
            </p>
            <table width="100%" border="0" cellpadding="0" cellspacing="0"
                   style="background:#f8fafc;border:1.5px solid #e8edf3;border-radius:14px;overflow:hidden;">
              <tbody>
                ${infoRow('&#x1F464;', 'Name',    customerName)}
                ${infoRow('&#x1F3E2;', 'Company', companyName)}
                ${visitorDesignation ? infoRow('&#x1FAA6;', 'Designation', visitorDesignation) : ''}
                ${mobile   ? infoRow('&#x1F4DE;', 'Mobile',   mobile)   : ''}
                ${email    ? infoRow('&#x2709;&#xFE0F;', 'Email', email) : ''}
                ${location ? infoRow('&#x1F4CD;', 'Location', location) : ''}
                ${product  ? infoRow('&#x1F4E6;', 'Product',
                    '<span style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid #bae6fd;">' + product + '</span>') : ''}
                ${leadsType && lc ? infoRow('&#x1F525;', 'Lead Type',
                    '<span style="display:inline-block;background:' + lc.bg + ';color:' + lc.text + ';padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid ' + lc.border + ';">' + leadsType + '</span>') : ''}
              </tbody>
            </table>
          </td>
        </tr>

        ${followUp ? `
        <!-- ===== FOLLOW-UP ===== -->
        <tr>
          <td class="section-pad" style="padding:18px 32px 0;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0"
                   style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:14px;overflow:hidden;">
              <tr>
                <td style="height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24);padding:0;"></td>
              </tr>
              <tr>
                <td style="padding:16px 22px 18px;">
                  <p style="margin:0 0 4px;font-size:10px;letter-spacing:2.5px;
                            text-transform:uppercase;color:#b45309;font-weight:800;">
                    &#x1F4C5;&nbsp; Follow-Up Call Scheduled
                  </p>
                  <p style="margin:0 0 6px;font-size:22px;font-weight:800;
                            color:#78350f;line-height:1.3;">${followUp}</p>
                  <p style="margin:0;font-size:13px;color:#92400e;line-height:1.7;">
                    Our team will reach out to discuss your requirements in detail.
                    Please keep your phone accessible. &#x1F4F1;
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ` : ''}

        ${remark ? `
        <!-- ===== REMARKS ===== -->
        <tr>
          <td class="section-pad" style="padding:18px 32px 0;">
            <p style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;
                      color:#94a3b8;font-weight:800;margin:0 0 10px;">
              &#x1F4DD;&nbsp; Notes from Our Team
            </p>
            <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;
                        border-left:4px solid #0d9488;padding:16px 20px;
                        font-size:14px;color:#334155;line-height:1.85;white-space:pre-wrap;">
              ${remark}
            </div>
          </td>
        </tr>
        ` : ''}

        <!-- ===== WHY DACCESS ===== -->
        <tr>
          <td class="section-pad" style="padding:22px 32px 0;">
            <p style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;
                      color:#94a3b8;font-weight:800;margin:0 0 14px;">
              &#x2728;&nbsp; Why Choose DAccess?
            </p>
            <table class="why-table" width="100%" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td class="why-td" style="width:33%;padding:0 5px 0 0;vertical-align:top;">
                  <div class="why-box"
                       style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);
                              border:1.5px solid #86efac;border-radius:14px;
                              padding:18px 12px;text-align:center;">
                    <div style="font-size:26px;margin-bottom:7px;">&#x1F3C6;</div>
                    <p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#14532d;">25+ Years</p>
                    <p style="margin:0;font-size:11px;color:#166534;line-height:1.5;">Trusted security solutions</p>
                  </div>
                </td>
                <td class="why-td" style="width:33%;padding:0 3px;vertical-align:top;">
                  <div class="why-box"
                       style="background:linear-gradient(135deg,#eff6ff,#dbeafe);
                              border:1.5px solid #93c5fd;border-radius:14px;
                              padding:18px 12px;text-align:center;">
                    <div style="font-size:26px;margin-bottom:7px;">&#x26A1;</div>
                    <p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#1e3a8a;">End-to-End</p>
                    <p style="margin:0;font-size:11px;color:#1d4ed8;line-height:1.5;">CCTV to Access Control</p>
                  </div>
                </td>
                <td class="why-td" style="width:33%;padding:0 0 0 5px;vertical-align:top;">
                  <div class="why-box"
                       style="background:linear-gradient(135deg,#fdf4ff,#f3e8ff);
                              border:1.5px solid #d8b4fe;border-radius:14px;
                              padding:18px 12px;text-align:center;">
                    <div style="font-size:26px;margin-bottom:7px;">&#x1F6E1;&#xFE0F;</div>
                    <p style="margin:0 0 4px;font-size:12px;font-weight:800;color:#581c87;">Expert Support</p>
                    <p style="margin:0;font-size:11px;color:#7c3aed;line-height:1.5;">Post-sales assistance</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ===== CONTACT CARD ===== -->
        <tr>
          <td style="padding:24px 32px 32px;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0"
                   style="background:linear-gradient(135deg,#0d9488 0%,#065f46 100%);
                          border-radius:16px;overflow:hidden;
                          box-shadow:0 8px 24px rgba(13,148,136,.28);">
              <tr>
                <td class="contact-cell" style="padding:28px 24px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:10px;letter-spacing:3px;
                            text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:700;">
                    &#x1F4AC;&nbsp; Have Questions? We're Here
                  </p>
                  <p class="contact-phone"
                     style="margin:0 0 8px;font-size:26px;font-weight:900;
                            color:#ffffff;letter-spacing:.5px;line-height:1.25;">
                    &#x1F4DE;&nbsp;${contactPhone}
                  </p>
                  <p style="margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.88);line-height:1.7;">
                    <strong style="color:#ffffff;">${contactName}</strong>
                    ${ownerName ? `<br/><span style="font-size:12px;color:rgba(255,255,255,.6);">${DACCESS_DEPARTMENT} &mdash; ${DACCESS_COMPANY_NAME}</span>` : ''}
                  </p>
                  <a href="tel:${contactPhone.replace(/\s/g,'')}"
                     style="display:inline-block;padding:11px 30px;background:#ffffff;
                            color:#0d9488;font-size:13px;font-weight:800;
                            text-decoration:none;border-radius:50px;letter-spacing:.4px;">
                    Call Us Now &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ===== FOOTER ===== -->
        <tr>
          <td class="footer-cell"
              style="padding:22px 32px 26px;background:#f8fafc;
                     border-top:1.5px solid #e8edf3;text-align:center;">
            <a href="${DACCESS_WEBSITE}" target="_blank"
               style="display:inline-block;margin-bottom:12px;text-decoration:none;">
              <img class="logo-img" src="${DACCESS_LOGO_URL}" alt="${DACCESS_COMPANY_NAME}"
                   width="76" height="auto"
                   style="display:block;margin:0 auto;opacity:.30;object-fit:contain;"/>
            </a>
            <p style="margin:0 0 4px;font-size:12.5px;color:#64748b;line-height:1.8;">
              <strong>
                <a href="${DACCESS_WEBSITE}" target="_blank"
                   style="color:#0d9488;text-decoration:none;">${DACCESS_COMPANY_NAME}</a>
              </strong>
            </p>
            <p style="margin:0;font-size:11.5px;color:#94a3b8;line-height:1.8;">
              &copy; ${new Date().getFullYear()} All rights reserved.<br/>
              This email confirms your visit at our exhibition stall.<br/>
              If received in error, please reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
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
  const toEmail        = visitData.email;
  const rawName        = visitData.exhibitionName;
  const exhibitionName = (rawName && typeof rawName === 'string' && rawName.trim())
                           ? rawName.trim() : 'our Exhibition';

  if (!toEmail || typeof toEmail !== 'string' || !toEmail.trim()) {
    console.log('[VisitThankYou] Skipped — no email address provided.');
    return { success: false, reason: 'no_email' };
  }

  if (!process.env.EMAIL) {
    console.error('[VisitThankYou] process.env.EMAIL is not set.');
    return { success: false, error: 'missing_env_EMAIL' };
  }

  console.log(`[VisitThankYou] Preparing email  → ${toEmail.trim()}`);
  console.log(`[VisitThankYou] Exhibition       : ${exhibitionName}`);
  console.log(`[VisitThankYou] Owner name       : ${visitData.ownerName  || 'none (using fallback)'}`);
  console.log(`[VisitThankYou] Owner mobile     : ${visitData.ownerMobile || 'none (using fallback)'}`);

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

    console.log(`[VisitThankYou] Email sent successfully → ${toEmail.trim()}`);
    return { success: true };

  } catch (err) {
    console.error(`[VisitThankYou] Failed → ${toEmail.trim()}`);
    console.error(`[VisitThankYou] Error code    : ${err.code    || 'N/A'}`);
    console.error(`[VisitThankYou] Error message : ${err.message}`);
    console.error(`[VisitThankYou] Response      : ${err.response || 'N/A'}`);
    return { success: false, error: err.message };
  }
};

module.exports = { sendVisitThankYouEmail };