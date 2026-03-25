const transporter = require('./emailTransporter');
const Lead        = require('../models/leadsModel.js');
const cron        = require('node-cron');

const DACCESS_WEBSITE       = 'https://daccess.co.in/';
// ✅ Absolute URL — works in all email clients
const DACCESS_LOGO_URL      = 'https://proclient360.com/static/assets/img/daccess.png';
const DACCESS_CONTACT_PHONE = '+91 8956307471';
const DACCESS_COMPANY_NAME  = 'DACCESS Security System PVT. LTD.';
const DACCESS_DEPARTMENT    = 'Sales & Marketing Department';

const formatDateIST = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const val = (v) => (v && String(v).trim()) ? String(v).trim() : '—';

const buildAddress = (lead) => {
  const parts = [
    lead.SENDER_ADDRESS,
    lead.SENDER_CITY,
    lead.SENDER_STATE,
    lead.SENDER_PINCODE,
  ].filter(p => p && String(p).trim());
  return parts.length ? parts.join(', ') : '—';
};

const tableRow = ([label, value]) => `
  <tr>
    <td style="width:140px;padding:9px 12px;font-size:13px;
               color:#6b7280;font-weight:500;
               border-bottom:1px solid #f1f5f9;
               vertical-align:top;white-space:nowrap;">
      ${label}
    </td>
    <td style="padding:9px 12px;font-size:13.5px;
               color:#1e293b;font-weight:600;
               border-bottom:1px solid #f1f5f9;
               vertical-align:top;">
      ${value}
    </td>
  </tr>`;

const buildEmailHTML = (lead) => {
  const queryDate  = formatDateIST(lead.QUERY_TIME || lead.createdAt);
  const senderName = val(lead.SENDER_NAME);
  const callCount  = lead.callHistory ? lead.callHistory.length : 9;
  const uniqueDays = lead.callHistory
    ? [...new Set(lead.callHistory.map(c => c.day))].length
    : 3;

  const senderRows = [
    ['Name',    val(lead.SENDER_NAME)],
    ['Company', val(lead.SENDER_COMPANY)],
    ['Email',   val(lead.SENDER_EMAIL)],
    ['Mobile',  val(lead.SENDER_MOBILE)],
    ['Address', buildAddress(lead)],
  ];

  const queryRows = [
    ['Product',    val(lead.QUERY_PRODUCT_NAME)],
    ['Subject',    val(lead.SUBJECT)],
    ['Message',    lead.QUERY_MESSAGE ? lead.QUERY_MESSAGE.substring(0, 400) : '—'],
    ['Source',     val(lead.SOURCE)],
    ['Query Time', queryDate],
  ];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>We Tried to Reach You – ${DACCESS_COMPANY_NAME}</title>
</head>
<body style="margin:0;padding:20px;background:#f1f5f9;
             font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">

<div style="max-width:620px;margin:0 auto;background:#fff;
            border-radius:12px;overflow:hidden;
            box-shadow:0 4px 16px rgba(0,0,0,.10);">

  <!-- HEADER with LOGO -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);">
    <tr>
      <td style="padding:32px 32px 24px;text-align:center;">

        <!-- Logo — clickable to website -->
        <a href="${DACCESS_WEBSITE}" target="_blank"
           style="display:inline-block;margin-bottom:14px;text-decoration:none;">
          <img
            src="${DACCESS_LOGO_URL}"
            alt="${DACCESS_COMPANY_NAME}"
            width="140"
            height="auto"
            style="display:block;margin:0 auto;
                   filter:brightness(0) invert(1);
                   max-height:52px;object-fit:contain;
                   border:0;outline:none;"
          />
        </a>

        <!-- Company name — clickable to website -->
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;
                  text-transform:uppercase;color:#e94560;font-weight:700;">
          <a href="${DACCESS_WEBSITE}" target="_blank"
             style="color:#e94560;text-decoration:none;">
            ${DACCESS_COMPANY_NAME}
          </a>
        </p>

        <h1 style="margin:10px 0 0;font-size:22px;font-weight:700;
                   color:#ffffff;line-height:1.35;">
          We Tried to Reach You
        </h1>
        <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">
          We were unable to connect with you despite multiple attempts.
        </p>

      </td>
    </tr>
  </table>

  <!-- ALERT BANNER -->
  <div style="background:#fff7ed;border-left:4px solid #f97316;
              padding:14px 32px;
              font-size:13.5px;color:#9a3412;line-height:1.6;">
    📞 &nbsp;We made <strong>${callCount} call attempts over ${uniqueDays} days</strong>
    to reach you but were unable to connect.
    Please call us back — we are eager to help you.
  </div>

  <!-- BODY -->
  <div style="padding:28px 32px 32px;">

    <p style="font-size:15px;font-weight:600;color:#1e293b;margin:0 0 14px;">
      Dear ${senderName},
    </p>

    <p style="font-size:14.5px;color:#475569;line-height:1.75;margin:0 0 20px;">
      We received your inquiry through <strong>${val(lead.SOURCE)}</strong> on
      <strong>${queryDate}</strong>. Our team has been trying to connect with
      you regarding your requirement, but unfortunately we were unable to reach
      you on your registered contact number.
    </p>

    <!-- SENDER INFORMATION -->
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 8px;">
      Sender Information
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;
                  border-radius:8px;overflow:hidden;margin-bottom:22px;">
      <tbody>
        ${senderRows.map(tableRow).join('')}
      </tbody>
    </table>

    <!-- QUERY INFORMATION -->
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 8px;">
      Query Information
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;
                  border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tbody>
        ${queryRows.map(tableRow).join('')}
      </tbody>
    </table>

    <!-- CALL ATTEMPT SUMMARY -->
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;
              color:#94a3b8;font-weight:700;margin:0 0 12px;">
      Call Attempt Summary
    </p>
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13.5px;color:#475569;">
        <div style="width:10px;height:10px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
        Day 1 &mdash; 3 call attempts made
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13.5px;color:#475569;">
        <div style="width:10px;height:10px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
        Day 2 &mdash; 3 call attempts made
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:13.5px;color:#475569;">
        <div style="width:10px;height:10px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
        Day 3 &mdash; 3 call attempts made &nbsp;
        <strong style="color:#1e293b;">(Total: ${callCount} attempts)</strong>
      </div>
      <div style="margin-top:6px;font-size:13px;color:#64748b;
                  font-style:italic;padding-left:20px;">
        Total: <strong style="color:#1e293b;">${callCount} attempts</strong>
        across <strong style="color:#1e293b;">${uniqueDays} days</strong>
      </div>
    </div>

    <p style="font-size:14.5px;color:#475569;line-height:1.75;margin:0 0 28px;">
      We are still very much interested in helping you with your requirement.
      Please do not hesitate to reach out to us.
    </p>

    <!-- CONTACT CARD -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#0f172a,#1e3a5f);
                  border-radius:10px;overflow:hidden;margin-bottom:10px;">
      <tr>
        <td style="padding:24px 28px;text-align:center;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;
                    text-transform:uppercase;color:#94a3b8;font-weight:600;">
            Call Us Back Anytime
          </p>
          <p style="margin:0 0 8px;font-size:28px;font-weight:700;
                    color:#ffffff;letter-spacing:1px;">
            📞 ${DACCESS_CONTACT_PHONE}
          </p>
          <p style="margin:0;font-size:13px;color:#cbd5e1;">
            <a href="${DACCESS_WEBSITE}" target="_blank"
               style="color:#ffffff;text-decoration:none;font-weight:700;">
              ${DACCESS_COMPANY_NAME}
            </a><br/>
            <span style="color:#94a3b8;">${DACCESS_DEPARTMENT}</span>
          </p>
        </td>
      </tr>
    </table>

    <p style="font-size:12.5px;color:#94a3b8;text-align:center;
              margin:10px 0 0;line-height:1.6;">
      For any query, contact our
      <strong style="color:#64748b;">${DACCESS_DEPARTMENT}</strong>
      on <strong style="color:#e94560;">${DACCESS_CONTACT_PHONE}</strong>
      &mdash; available Mon&ndash;Sat, 9 AM to 7 PM IST.
    </p>

  </div>

  <!-- FOOTER -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;
              padding:20px 32px;text-align:center;
              font-size:12px;color:#94a3b8;line-height:1.7;">

    <!-- Footer logo -->
    <a href="${DACCESS_WEBSITE}" target="_blank"
       style="display:inline-block;margin-bottom:10px;text-decoration:none;">
      <img
        src="${DACCESS_LOGO_URL}"
        alt="${DACCESS_COMPANY_NAME}"
        width="90"
        height="auto"
        style="display:block;margin:0 auto;opacity:0.5;
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
    This email was sent because you submitted an inquiry that we were
    unable to follow up via phone.<br/>
    If you believe this was sent in error, please reply to this email.
  </div>

</div>
</body>
</html>`.trim();
};

const buildPlainText = (lead) => {
  const queryDate = formatDateIST(lead.QUERY_TIME || lead.createdAt);
  return [
    `Dear ${val(lead.SENDER_NAME)},`,
    '',
    `We received your inquiry on ${queryDate} and tried to reach you multiple times but could not connect.`,
    '',
    '── SENDER INFORMATION ──',
    `Name    : ${val(lead.SENDER_NAME)}`,
    `Company : ${val(lead.SENDER_COMPANY)}`,
    `Email   : ${val(lead.SENDER_EMAIL)}`,
    `Mobile  : ${val(lead.SENDER_MOBILE)}`,
    `Address : ${buildAddress(lead)}`,
    '',
    '── QUERY INFORMATION ──',
    `Product    : ${val(lead.QUERY_PRODUCT_NAME)}`,
    `Subject    : ${val(lead.SUBJECT)}`,
    `Message    : ${val(lead.QUERY_MESSAGE)}`,
    `Source     : ${val(lead.SOURCE)}`,
    `Query Time : ${queryDate}`,
    '',
    `Please call us back on: ${DACCESS_CONTACT_PHONE}`,
    `Visit us: ${DACCESS_WEBSITE}`,
    `${DACCESS_COMPANY_NAME} — ${DACCESS_DEPARTMENT}`,
    'Available Mon–Sat, 9 AM to 7 PM IST.',
    '',
    `Regards,`,
    `${DACCESS_COMPANY_NAME}`,
  ].join('\n');
};

// ── Core send function ───────────────────────────────────────
const sendCallUnansweredEmails = async () => {
  console.log('=== [CallUnansweredMail] Job started at:', new Date().toISOString(), '===');

  try {
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    const leads = await Lead.find({
      feasibility:            'call-unanswered',
      SENDER_EMAIL:           { $exists: true, $nin: [null, ''] },
      callUnansweredMailSent: { $ne: true },
      $or: [
        { QUERY_TIME: { $lte: fourDaysAgo } },
        { QUERY_TIME: null,              createdAt: { $lte: fourDaysAgo } },
        { QUERY_TIME: { $exists: false }, createdAt: { $lte: fourDaysAgo } },
      ],
    })
      .populate('company', 'name')
      .lean();

    console.log(`[CallUnansweredMail] ${leads.length} lead(s) eligible.`);

    if (leads.length === 0) {
      console.log('[CallUnansweredMail] Nothing to send. Exiting.');
      return { success: true, sentCount: 0, errorCount: 0 };
    }

    let sentCount  = 0;
    let errorCount = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      try {
        const subject = val(lead.SUBJECT) !== '—'
          ? val(lead.SUBJECT)
          : val(lead.QUERY_PRODUCT_NAME) !== '—'
            ? val(lead.QUERY_PRODUCT_NAME)
            : 'Your Inquiry';

        const mailOptions = {
          from:    `"${DACCESS_COMPANY_NAME}" <${process.env.EMAIL}>`,
          to:      lead.SENDER_EMAIL,
          subject: `We tried to reach you — ${subject} | ${DACCESS_COMPANY_NAME}`,
          html:    buildEmailHTML(lead),
          text:    buildPlainText(lead),
        };

        await new Promise((resolve, reject) => {
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error(`[CallUnansweredMail] ❌ ${lead.SENDER_EMAIL} — ${error.message}`);
              reject(error);
            } else {
              console.log(`[CallUnansweredMail] ✅ Sent → ${lead.SENDER_EMAIL} (Lead: ${lead._id})`);
              resolve(info);
            }
          });
        });

        // Mark as sent — this lead will NEVER be emailed again
        await Lead.updateOne(
          { _id: lead._id },
          {
            $set: {
              callUnansweredMailSent:   true,
              callUnansweredMailSentAt: new Date(),
            },
          }
        );

        sentCount++;

        if (i < leads.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (err) {
        errorCount++;
        console.error(`[CallUnansweredMail] ❌ Lead ${lead._id}:`, err.message);
      }
    }

    console.log(`=== [CallUnansweredMail] Done — Sent: ${sentCount}, Errors: ${errorCount} ===`);
    return { success: true, sentCount, errorCount };

  } catch (err) {
    console.error('[CallUnansweredMail] Fatal error:', err.message);
    return { success: false, error: err.message };
  }
};

// Cron: 9:00 AM IST every day
let scheduledTask = null;

const initCallUnansweredMailScheduler = () => {
  if (scheduledTask) scheduledTask.destroy();

  scheduledTask = cron.schedule(
    '0 9 * * *',
    async () => {
      console.log('⏰ [CallUnansweredMail] Cron fired at:', new Date().toISOString());
      const result = await sendCallUnansweredEmails();
      console.log(result.success
        ? `✅ Sent: ${result.sentCount}`
        : `❌ Error: ${result.error}`
      );
    },
    { scheduled: true, timezone: 'Asia/Kolkata' }
  );

  console.log(' [CallUnansweredMail] Scheduler ready — 09:00 AM IST daily.');
};

module.exports = { initCallUnansweredMailScheduler, sendCallUnansweredEmails };