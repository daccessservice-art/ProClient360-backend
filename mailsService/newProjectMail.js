const transporter = require('./emailTransporter');
const Project = require('../models/projectModel');
const Employee = require('../models/employeeModel');
const Designation = require('../models/designationModel');

// Company model is optional — if the file name is different, we fall back safely
let Company = null;
try { Company = require('../models/companyModel'); } catch (e) { Company = null; }

// ══════════════════════════════════════════════════════════════
//  Who receives the "New Project Created" mail
// ══════════════════════════════════════════════════════════════
const targetDesignationNames = [
  'Director Customer Delight',
  'CEO',
  'Director Digi Solution',
  'Junior Software Developer',
  'Executive Director-Project'
];

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════
// Escape user-typed text so it can't break the email HTML
const esc = (val) => {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatIST = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
};

const formatDateTimeIST = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  const datePart = d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
  });
  return `${datePart}, ${timePart}`;
};

const formatAmount = (val) => {
  const num = Number(val);
  if (!num || num <= 0) return '₹0.00';
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
};

const pct = (val) => `${Number(val) || 0}%`;

const getStatusBadge = (status) => {
  const map = {
    Upcoming:  { bg: '#dbeafe', color: '#1e40af' },
    Inprocess: { bg: '#fef3c7', color: '#92400e' },
    Completed: { bg: '#d1fae5', color: '#065f46' },
  };
  const s = map[status] || { bg: '#e5e7eb', color: '#374151' };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;">${esc(status || 'N/A')}</span>`;
};

const getApprovalBadge = (status) => {
  const map = {
    Approved: { bg: '#d1fae5', color: '#065f46', label: '✅ Approved' },
    Rejected: { bg: '#fee2e2', color: '#991b1b', label: '❌ Rejected' },
    Pending:  { bg: '#fef3c7', color: '#92400e', label: '⏳ Pending Approval' },
  };
  const s = map[status] || map.Pending;
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;">${s.label}</span>`;
};

// One "label | value" row in a details table
const row = (label, value) => `
  <tr>
    <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;width:38%;font-size:13px;">${label}</td>
    <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;color:#1e293b;font-size:13px;">${value}</td>
  </tr>
`;

const sectionTitle = (title) => `
  <h2 style="font-size:16px;font-weight:700;color:#1e3a5f;border-left:4px solid #2563eb;padding-left:10px;margin:26px 0 10px;">
    ${title}
  </h2>
`;

// ── Batch email sender (same pattern as dailyTaskSheetReport.js) ──
const sendEmailInBatches = async (recipients, mailOptions, companyName) => {
  const MAX_RECIPIENTS_PER_EMAIL = 5;
  const batches = [];
  for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_EMAIL) {
    batches.push(recipients.slice(i, i + MAX_RECIPIENTS_PER_EMAIL));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchOptions = {
      ...mailOptions,
      to: batch.join(','),
      subject: batches.length > 1
        ? `${mailOptions.subject} [${i + 1}/${batches.length}]`
        : mailOptions.subject,
    };

    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail(batchOptions, (error, info) => {
          if (error) return reject(error);
          resolve(info);
        });
      });
      console.log(`✅ New project mail batch ${i + 1}/${batches.length} sent to ${batch.length} recipients (${companyName})`);
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      console.error(`❌ New project mail batch ${i + 1} failed (${companyName}):`, error.message);
    }
  }
};

// ══════════════════════════════════════════════════════════════
//  Build the email HTML
// ══════════════════════════════════════════════════════════════
const buildEmailHtml = (project, companyName) => {
  const customer = project.custId || {};
  const creator = project.createdBy || {};
  const addr = project.Address || {};
  const approval = project.approvalStatus || 'Approved';

  const fullAddress = [addr.add, addr.city, addr.state, addr.country, addr.pincode]
    .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
    .map(esc)
    .join(', ') || 'N/A';

  const totalPay =
    (Number(project.advancePay) || 0) +
    (Number(project.payAgainstDelivery) || 0) +
    (Number(project.payAfterCompletion) || 0);

  const approvalBanner = approval === 'Pending'
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#92400e;font-size:13px;">
         ⏳ <strong>Approval Required:</strong> This project is waiting for approval by <strong>Director Customer Delight</strong>.
         Task assignment and MRF stay locked until it is approved.
       </div>`
    : `<div style="background:#d1fae5;border:1px solid #10b981;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#065f46;font-size:13px;">
         ✅ This project was created and <strong>approved</strong> directly.
       </div>`;

  const poCopyBtn = project.POCopy
    ? `<a href="${esc(project.POCopy)}" target="_blank" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;">📄 View PO Copy</a>`
    : '<span style="color:#9ca3af;">Not uploaded</span>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Project Created</title>
      <style>
        body { font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; margin:0; padding:20px; background:#f5f7fa; }
        .container { max-width:820px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.1); }
        .content { padding:26px 30px; }
        .details { width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:8px; }
        .footer { background:#f9fafb; padding:18px; text-align:center; font-size:12px; color:#6b7280; border-top:1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">

        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);">
          <tr>
            <td align="center" style="padding:28px;">
              <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="48" height="48" style="display:block;margin:0 auto 12px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;font-family:'Segoe UI',sans-serif;">
                🚀 New Project Created
              </h1>
              <p style="margin:8px 0 0;font-size:14px;color:#bfdbfe;font-family:'Segoe UI',sans-serif;">
                ${esc(companyName)} &nbsp;|&nbsp; ${formatDateTimeIST(project.createdAt)}
              </p>
            </td>
          </tr>
        </table>

        <div class="content">

          ${approvalBanner}

          <!-- Summary cards -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-collapse:separate;border-spacing:8px;">
            <tr>
              <td width="33%" style="background:#EFF6FF;border-left:4px solid #3b82f6;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:18px;font-weight:800;color:#1e40af;">${formatAmount(project.purchaseOrderValue)}</div>
                <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">PO Value (Without GST)</div>
              </td>
              <td width="33%" style="background:#ECFDF5;border-left:4px solid #10b981;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:15px;font-weight:800;color:#065f46;">${formatIST(project.startDate)} → ${formatIST(project.endDate)}</div>
                <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Project Duration</div>
              </td>
              <td width="33%" style="background:#FFF7ED;border-left:4px solid #f97316;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:15px;font-weight:800;color:#9a3412;">${esc(project.category || 'N/A')}</div>
                <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Category</div>
              </td>
            </tr>
          </table>

          ${sectionTitle('📁 Project Details')}
          <table class="details">
            ${row('Project Name', `<strong>${esc(project.name)}</strong>`)}
            ${row('Category', esc(project.category || 'N/A'))}
            ${row('Project Status', getStatusBadge(project.projectStatus))}
            ${row('Approval Status', getApprovalBadge(approval))}
            ${row('Completion Level', pct(project.completeLevel))}
            ${row('Start Date', formatIST(project.startDate))}
            ${row('End Date (Expected)', formatIST(project.endDate))}
            ${row('Actual Completion Date', project.actualCompletionDate ? formatIST(project.actualCompletionDate) : '—')}
          </table>

          ${sectionTitle('👤 Customer Details')}
          <table class="details">
            ${row('Customer Name', `<strong>${esc(customer.custName || 'N/A')}</strong>`)}
            ${row('Customer Email', esc(customer.email || 'N/A'))}
            ${row('Customer Phone', esc(customer.phoneNumber1 || 'N/A'))}
            ${row('Site Address', fullAddress)}
          </table>

          ${sectionTitle('🧾 Purchase Order')}
          <table class="details">
            ${row('PO Number', `<strong>${esc(project.purchaseOrderNo || 'N/A')}</strong>`)}
            ${row('PO Date', formatIST(project.purchaseOrderDate))}
            ${row('PO Value (Without GST)', `<strong>${formatAmount(project.purchaseOrderValue)}</strong>`)}
            ${row('PO Copy', poCopyBtn)}
          </table>

          ${sectionTitle('💰 Payment Terms')}
          <table class="details">
            ${row('Advance Payment', pct(project.advancePay))}
            ${row('Pay Against Delivery', pct(project.payAgainstDelivery))}
            ${row('Pay After Completion', pct(project.payAfterCompletion))}
            ${row('Retention', pct(project.retention))}
            ${row('Retention Days', `${Number(project.retentionDays) || 0} days`)}
            ${row('Total (excluding Retention)', `<strong>${totalPay}%</strong>`)}
          </table>

          ${sectionTitle('📝 Other Info')}
          <table class="details">
            ${row('Created By', `${esc(creator.name || 'Unknown')}${creator.email ? ` <span style="color:#6b7280;">(${esc(creator.email)})</span>` : ''}`)}
            ${row('Created On', formatDateTimeIST(project.createdAt))}
            ${row('Remark', project.remark ? esc(project.remark) : '—')}
          </table>

        </div>

        <!-- Footer -->
        <div class="footer">
          <p>© ${new Date().getFullYear()} ProClient360. All rights reserved.</p>
          <p>This is an automated mail, sent whenever a new project is created in Project Master.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ══════════════════════════════════════════════════════════════
//  Main function — call this after a project is saved
// ══════════════════════════════════════════════════════════════
const sendNewProjectMail = async (projectId) => {
  try {
    const project = await Project.findById(projectId)
      .populate('custId', 'custName email phoneNumber1')
      .populate({ path: 'createdBy', model: 'Employee', select: 'name email' })
      .lean();

    if (!project) {
      console.log(`[newProjectMail] Project ${projectId} not found, mail skipped`);
      return false;
    }

    const companyId = project.company;

    // Designation lookup — case-insensitive exact match
    const targetDesignations = await Designation.find({
      name: { $in: targetDesignationNames.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i')) }
    }).select('_id');
    const designationIds = targetDesignations.map(d => d._id);

    if (designationIds.length === 0) {
      console.log('[newProjectMail] No matching designations found, mail skipped');
      return false;
    }

    const recipients = await Employee.find({
      company: companyId,
      designation: { $in: designationIds },
      email: { $exists: true, $ne: '' }
    }).select('name email').lean();

    const recipientEmails = [...new Set(
      recipients.map(r => (r.email || '').trim()).filter(e => e.includes('@'))
    )];

    if (recipientEmails.length === 0) {
      console.log(`[newProjectMail] No recipients for company ${companyId}, mail skipped`);
      return false;
    }

    // Company name
    let companyName = 'Your Company';
    try {
      if (Company) {
        const c = await Company.findById(companyId).select('name').lean();
        if (c?.name) companyName = c.name;
      }
    } catch (e) { /* keep default */ }

    const html = buildEmailHtml(project, companyName);
    const customerName = project.custId?.custName || 'N/A';
    const pendingTag = project.approvalStatus === 'Pending' ? ' [Approval Pending]' : '';

    await sendEmailInBatches(recipientEmails, {
      from: `ProClient360 <${process.env.EMAIL}>`,
      subject: `🚀 New Project Created — ${customerName} — PO ${project.purchaseOrderNo || 'N/A'}${pendingTag}`,
      html,
    }, companyName);

    console.log(`[newProjectMail] Sent for project ${project._id} to: ${recipientEmails.join(', ')}`);
    return true;
  } catch (error) {
    console.error('[newProjectMail] Error:', error.message);
    return false;
  }
};

module.exports = { sendNewProjectMail };