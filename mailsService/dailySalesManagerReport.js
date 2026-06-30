const cron = require('node-cron');
const transporter = require('./emailTransporter');
const Lead = require('../models/leadsModel');
const Employee = require('../models/employeeModel');
const Designation = require('../models/designationModel');

const targetDesignationNames = [
  'Director Customer Delight',
  'CEO',
  'Director Digi Solution',
  'Junior Software Developer',
  'Sales Manager',
  'Marketing',
  'Executive Director-Project'
];

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════
const formatIST = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
};

const formatAmount = (val) => {
  if (!val || val <= 0) return '—';
  return '₹' + Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
};

const classifyFollowUp = (lead) => {
  if (!lead.nextFollowUpDate) return 'none';
  const date = new Date(lead.nextFollowUpDate);
  if (isNaN(date.getTime())) return 'none';

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (date >= start && date <= end) return 'today';
  if (date < start) return 'overdue';
  return 'future';
};

// ✅ Robust assigned-employee name resolver (same safe pattern as dailyLeadReport.js)
const getAssignedName = (lead) => {
  const extractName = (field) => {
    if (!field) return null;
    if (typeof field === 'object' && field.name && field.name.trim()) return field.name.trim();
    if (typeof field === 'string' && field.trim()) return field.trim();
    return null;
  };
  return extractName(lead.assignedTo) || extractName(lead.assignedBy) || 'Unassigned';
};

// ══════════════════════════════════════════════════════════════
//  Row / Section builders
// ══════════════════════════════════════════════════════════════
const buildLeadRow = (lead) => `
  <tr>
    <td>${lead.SENDER_COMPANY || 'N/A'}</td>
    <td>${lead.SENDER_NAME || 'N/A'}</td>
    <td>${lead.QUERY_PRODUCT_NAME || 'N/A'}</td>
    <td>${lead.SENDER_MOBILE || 'N/A'}</td>
    <td style="text-align:right;">${formatAmount(lead.quotation)}</td>
    <td>${lead.nextFollowUpDate ? formatIST(lead.nextFollowUpDate) : 'Not set'}</td>
    <td><span class="status-badge status-${(lead.STATUS || 'Pending').toLowerCase()}">${lead.STATUS}</span></td>
  </tr>
`;

// Groups leads under each assigned employee within a section (Overdue / Today / Pending)
const buildSection = (title, leads, badgeColor) => {
  if (leads.length === 0) return '';

  const byEmp = {};
  for (const l of leads) {
    const name = getAssignedName(l);
    if (!byEmp[name]) byEmp[name] = [];
    byEmp[name].push(l);
  }

  const employeeBlocks = Object.entries(byEmp).map(([name, empLeads]) => `
    <div style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;color:#374151;background:#f3f4f6;padding:5px 10px;border-radius:6px;display:inline-block;margin-bottom:6px;">
        👤 ${name} (${empLeads.length})
      </div>
      <table class="lead-table">
        <thead>
          <tr>
            <th>Company</th><th>Contact</th><th>Product</th><th>Mobile</th>
            <th style="text-align:right;">Amount</th><th>Follow-up Date</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${empLeads.map(buildLeadRow).join('')}</tbody>
      </table>
    </div>
  `).join('');

  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:16px;font-weight:700;color:${badgeColor};border-left:4px solid ${badgeColor};padding-left:10px;margin-bottom:10px;">
        ${title} (${leads.length})
      </h2>
      ${employeeBlocks}
    </div>
  `;
};

// Per-employee performance summary table (worst performers — most today/overdue — listed first)
const buildEmployeeSummaryTable = (leads) => {
  const byEmp = {};
  for (const l of leads) {
    const name = getAssignedName(l);
    if (!byEmp[name]) byEmp[name] = { pending: 0, today: 0, overdue: 0, amount: 0 };
    const cls = classifyFollowUp(l);
    if (l.STATUS === 'Pending') byEmp[name].pending++;
    if (cls === 'today') byEmp[name].today++;
    if (cls === 'overdue') byEmp[name].overdue++;
    byEmp[name].amount += (l.quotation || 0);
  }

  const rows = Object.entries(byEmp)
    .sort((a, b) => (b[1].overdue + b[1].today) - (a[1].overdue + a[1].today))
    .map(([name, c]) => `
      <tr>
        <td style="font-weight:600;">👤 ${name}</td>
        <td style="text-align:center;">${c.pending}</td>
        <td style="text-align:center; ${c.today > 0 ? 'color:#9a3412;font-weight:700;' : ''}">${c.today}</td>
        <td style="text-align:center; ${c.overdue > 0 ? 'color:#991b1b;font-weight:700;' : ''}">${c.overdue}</td>
        <td style="text-align:right;">${formatAmount(c.amount)}</td>
      </tr>
    `).join('');

  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:16px;font-weight:700;color:#0f3460;border-left:4px solid #0f3460;padding-left:10px;margin-bottom:10px;">
        👥 Sales Employee Performance Summary
      </h2>
      <table class="lead-table">
        <thead>
          <tr>
            <th>Employee</th><th style="text-align:center;">Pending</th>
            <th style="text-align:center;">Today</th><th style="text-align:center;">Overdue</th>
            <th style="text-align:right;">Pipeline Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
};

// ══════════════════════════════════════════════════════════════
//  Main report sender — one consolidated email per company,
//  sent to all employees holding target designations
// ══════════════════════════════════════════════════════════════
const sendDailySalesManagerReport = async (isScheduledRun = false) => {
  try {
    console.log('=== Starting Sales Manager daily report at:', new Date().toISOString(), '===');

    const targetDesignations = await Designation.find({
      name: { $in: targetDesignationNames }
    }).select('_id');
    const designationIds = targetDesignations.map(d => d._id);

    const companies = await Employee.distinct('company', {
      designation: { $in: designationIds }
    });

    console.log(`Found ${companies.length} companies to send Sales Manager reports to`);

    for (let i = 0; i < companies.length; i++) {
      const companyId = companies[i];

      try {
        const activeLeads = await Lead.find({
          company: companyId,
          feasibility: 'feasible',
          STATUS: { $in: ['Pending', 'Ongoing'] },
        })
          .populate('assignedTo', 'name email')
          .populate('assignedBy', 'name email')
          .lean();

        if (activeLeads.length === 0) {
          console.log(`No active leads for company ${companyId}, skipping`);
          continue;
        }

        const todayLeads   = activeLeads.filter(l => classifyFollowUp(l) === 'today');
        const overdueLeads = activeLeads.filter(l => classifyFollowUp(l) === 'overdue');
        const pendingLeads = activeLeads.filter(l => l.STATUS === 'Pending');

        const recipients = await Employee.find({
          company: companyId,
          designation: { $in: designationIds },
          email: { $exists: true, $ne: '' }
        }).select('name email designation').populate('designation', 'name');

        if (recipients.length === 0) {
          console.log(`No recipients with target designations for company ${companyId}`);
          continue;
        }

        const companyDoc = await Employee.findById(companyId).select('name');
        const companyName = companyDoc ? companyDoc.name : 'Company';

        const totalAmount = activeLeads.reduce((s, l) => s + (l.quotation || 0), 0);

        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; margin:0; padding:20px; background:#f5f7fa; }
              .container { max-width:980px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.1); }
              .header { background:linear-gradient(135deg,#0f3460 0%,#16213e 100%); color:#fff; padding:24px 30px; }
              .header h1 { margin:0; font-size:22px; }
              .header p { margin:6px 0 0; font-size:14px; opacity:.85; }
              .content { padding:24px 30px; }
              .stats { display:flex; gap:10px; margin-bottom:24px; }
              .stat-card { flex:1; border-radius:8px; padding:14px; text-align:center; }
              .stat-num { font-size:26px; font-weight:800; }
              .stat-lbl { font-size:11px; text-transform:uppercase; color:#6b7280; font-weight:600; }
              .lead-table { width:100%; border-collapse:collapse; margin-bottom:10px; }
              .lead-table th, .lead-table td { padding:8px 10px; text-align:left; border-bottom:1px solid #e5e7eb; font-size:12.5px; }
              .lead-table th { background:#f9fafb; font-weight:600; color:#374151; }
              .status-badge { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:700; }
              .status-pending { background:#fff3cd; color:#856404; }
              .status-ongoing { background:#cfe2ff; color:#084298; }
              .footer { background:#f9fafb; padding:16px 30px; text-align:center; font-size:12px; color:#6b7280; border-top:1px solid #e5e7eb; }
              ${!isScheduledRun ? '.dev-notice{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:18px;color:#92400e;font-size:13px;}' : ''}
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📊 Sales Manager — Daily Lead Report</h1>
                <p>${companyName} — ${formatIST(new Date())}</p>
              </div>
              <div class="content">
                ${!isScheduledRun ? '<div class="dev-notice">⚠️ PREVIEW MODE — email not actually sent.</div>' : ''}
                <div class="stats">
                  <div class="stat-card" style="background:#fff3cd;">
                    <div class="stat-num" style="color:#856404;">${pendingLeads.length}</div>
                    <div class="stat-lbl">Pending</div>
                  </div>
                  <div class="stat-card" style="background:#ffedd5;">
                    <div class="stat-num" style="color:#9a3412;">${todayLeads.length}</div>
                    <div class="stat-lbl">Today's Follow-up</div>
                  </div>
                  <div class="stat-card" style="background:#fee2e2;">
                    <div class="stat-num" style="color:#991b1b;">${overdueLeads.length}</div>
                    <div class="stat-lbl">Overdue</div>
                  </div>
                  <div class="stat-card" style="background:#e8f4fd;">
                    <div class="stat-num" style="color:#1565C0;font-size:18px;">${formatAmount(totalAmount)}</div>
                    <div class="stat-lbl">Total Pipeline</div>
                  </div>
                </div>

                ${buildEmployeeSummaryTable(activeLeads)}
                ${buildSection('🚨 Overdue Follow-ups', overdueLeads, '#991b1b')}
                ${buildSection("📅 Today's Follow-ups", todayLeads, '#9a3412')}
                ${buildSection('⏳ Pending Leads', pendingLeads, '#856404')}
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} ProClient360. Automated report sent daily at 12:00 AM IST.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        const recipientEmails = recipients
          .map(r => r.email)
          .filter(email => email && email.includes('@'));

        if (recipientEmails.length > 0 && isScheduledRun) {
          await new Promise((resolve, reject) => {
            transporter.sendMail({
              from: `ProClient360 <${process.env.EMAIL}>`,
              to: recipientEmails.join(','),
              subject: `Sales Manager Daily Report — ${companyName} — Pending:${pendingLeads.length} Today:${todayLeads.length} Overdue:${overdueLeads.length}`,
              html: emailContent,
            }, (error, info) => {
              if (error) {
                console.error(`Failed to send report for company ${companyId}:`, error.message);
                reject(error);
              } else {
                console.log(`✅ Sales Manager report sent to ${recipientEmails.length} recipients for ${companyName}`);
                resolve(info);
              }
            });
          }).catch(() => {});
        } else if (recipientEmails.length === 0) {
          console.log(`No valid recipient emails for company ${companyId}`);
        } else {
          console.log(`🔍 PREVIEW MODE: Would send to ${recipientEmails.join(', ')} (Pending:${pendingLeads.length} Today:${todayLeads.length} Overdue:${overdueLeads.length})`);
        }

        if (i < companies.length - 1) {
          console.log('Waiting 10 seconds before next company...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      } catch (companyError) {
        console.error(`Error processing company ${companyId}:`, companyError.message);
      }
    }

    console.log('=== Sales Manager daily report completed at:', new Date().toISOString(), '===');
    return true;
  } catch (error) {
    console.error('Error in sendDailySalesManagerReport:', error.message);
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
//  Scheduler — runs at 12:00 AM (midnight) IST every day
// ══════════════════════════════════════════════════════════════
let scheduledTask = null;

const initializeDailySalesManagerReportScheduler = () => {
  if (scheduledTask) scheduledTask.destroy();

  scheduledTask = cron.schedule('0 0 * * *', async () => {
    console.log('⏰ CRON JOB: Running Sales Manager daily report at:', new Date().toISOString());
    const result = await sendDailySalesManagerReport(true);
    console.log(result ? '✅ CRON JOB: Sales Manager report sent.' : '❌ CRON JOB: Failed to send report.');
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('📅 Sales Manager daily report scheduler initialized — runs at 12:00 AM IST daily.');
};

module.exports = {
  sendDailySalesManagerReport,
  initializeDailySalesManagerReportScheduler,
};