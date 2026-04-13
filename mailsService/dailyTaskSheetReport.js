const transporter = require("./emailTransporter");
const TaskSheet = require('../models/taskSheetModel');
const Action = require('../models/actionModel');
const Employee = require('../models/employeeModel');
const { formatDate } = require('../utils/formatDate');
const cron = require('node-cron');

// ── Batch email sender ──
const sendEmailInBatches = async (recipients, mailOptions, companyName) => {
  const MAX_RECIPIENTS_PER_EMAIL = 5;
  const batches = [];

  for (let i = 0; i < recipients.length; i += MAX_RECIPIENTS_PER_EMAIL) {
    batches.push(recipients.slice(i, i + MAX_RECIPIENTS_PER_EMAIL));
  }

  console.log(`Sending to ${recipients.length} recipients in ${batches.length} batches for ${companyName}`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchOptions = {
      ...mailOptions,
      to: batch.join(','),
      subject: `${mailOptions.subject} [Batch ${i + 1}/${batches.length}]`
    };

    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail(batchOptions, (error, info) => {
          if (error) {
            console.error(`Batch ${i + 1} failed for ${companyName}:`, error.message);
            reject(error);
          } else {
            console.log(`✅ Batch ${i + 1}/${batches.length} sent to ${batch.length} recipients for ${companyName}`);
            resolve(info);
          }
        });
      });

      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`Error sending batch ${i + 1} for ${companyName}:`, error.message);
    }
  }
};

// ── Format datetime: "11 Apr 2026 14:30" ──
const formatDateTime = (date) => {
  if (!date) return '<span style="color:#9ca3af;">N/A</span>';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '<span style="color:#9ca3af;">N/A</span>';
  const datePart = d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
  const timePart = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
  });
  return `${datePart} ${timePart}`;
};

// ── Format plain date: "11 Apr 2026" ──
const formatPlainDate = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Priority badge ──
const getPriorityBadge = (priority) => {
  const map = {
    high:   { bg: '#fee2e2', color: '#991b1b', label: '🔴 High' },
    medium: { bg: '#fef9c3', color: '#92400e', label: '🟡 Medium' },
    low:    { bg: '#d1fae5', color: '#065f46', label: '🟢 Low' },
  };
  const s = map[priority] || map.medium;
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${s.label}</span>`;
};

// ── Progress bar ──
const getProgressBar = (pct) => {
  const num = Number(pct) || 0;
  const barColor = num === 100 ? '#10b981' : num >= 50 ? '#f59e0b' : '#3b82f6';
  return `
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-weight:700;font-size:12px;min-width:34px;color:${barColor};">${num}%</span>
      <div style="background:#e5e7eb;border-radius:4px;height:8px;width:70px;overflow:hidden;">
        <div style="background:${barColor};width:${num}%;height:100%;border-radius:4px;"></div>
      </div>
      ${num === 100 ? '<span style="color:#10b981;font-size:11px;font-weight:700;">✓ Done</span>' : ''}
    </div>`;
};

// ── Main report function ──
const sendDailyTaskSheetReport = async (isScheduledRun = false) => {
  try {
    console.log('=== Starting daily task sheet report at:', new Date().toISOString(), '===');
    console.log('📧 Email Sending:', isScheduledRun ? 'ENABLED (Scheduled Run)' : 'DISABLED (Manual Run)');

    const Designation = require('../models/designationModel');

    // ── Yesterday's date window ──
    const today = new Date();
    const reportDate = new Date(today);
    reportDate.setDate(reportDate.getDate() - 1);

    const startOfDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate(), 23, 59, 59, 999);

    console.log(`📅 Report covers: ${startOfDay.toISOString()} → ${endOfDay.toISOString()}`);

    // ── Target designations ──
    const targetDesignationNames = [
      'CEO & Founder',
      'Director Digi Solution',
      'Junior Software Developer',
      'Executive Director-Project'
    ];
    const targetDesignations = await Designation.find({
      name: { $in: targetDesignationNames }
    }).select('_id');

    const designationIds = targetDesignations.map(d => d._id);

    const companies = await Employee.distinct('company', {
      designation: { $in: designationIds }
    });

    console.log(`Found ${companies.length} companies for task sheet report`);

    for (let ci = 0; ci < companies.length; ci++) {
      const companyId = companies[ci];

      try {
        console.log(`Processing company ${ci + 1}/${companies.length}: ${companyId}`);

        // ✅ Only tasks CREATED yesterday
        const taskSheets = await TaskSheet.find({
          company: companyId,
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        })
          .populate('taskName', 'name')
          .populate('employees', 'name email')
          .populate('assignedBy', 'name email')
          .populate('project', 'name')
          .lean();

        console.log(`  Yesterday new tasks: ${taskSheets.length}`);

        // ✅ Only actions on those tasks, performed yesterday
        const taskSheetIds = taskSheets.map(t => t._id);

        let yesterdayActions = [];
        if (taskSheetIds.length > 0) {
          yesterdayActions = await Action.find({
            task: { $in: taskSheetIds },
            createdAt: { $gte: startOfDay, $lte: endOfDay }
          })
            .populate('actionBy', 'name')
            .lean();
        }

        console.log(`  Yesterday actions: ${yesterdayActions.length}`);

        // Group actions by taskId
        const actionsByTask = {};
        yesterdayActions.forEach(action => {
          const tid = action.task?.toString();
          if (!actionsByTask[tid]) actionsByTask[tid] = [];
          actionsByTask[tid].push(action);
        });

        // ── Summary counts ──
        const totalTasks      = taskSheets.length;
        const completedTasks  = taskSheets.filter(t => t.taskLevel === 100).length;
        const inProgressTasks = taskSheets.filter(t => t.taskLevel > 0 && t.taskLevel < 100).length;
        const notStarted      = taskSheets.filter(t => !t.taskLevel || t.taskLevel === 0).length;
        const totalActions    = yesterdayActions.length;

        // ── Recipients ──
        const recipients = await Employee.find({
          company: companyId,
          designation: { $in: designationIds },
          email: { $exists: true, $ne: '' }
        }).select('name email').lean();

        if (recipients.length === 0) {
          console.log(`No recipients found for company ${companyId}`);
          continue;
        }

        const company = await Employee.findById(companyId).select('name').lean();
        const companyName = company?.name || 'Your Company';

        // ── Build task rows ──
        const buildTaskRows = () => {
          if (taskSheets.length === 0) {
            return `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:28px;font-style:italic;">
              No tasks were created or assigned on ${formatPlainDate(reportDate)}.
            </td></tr>`;
          }

          return taskSheets.flatMap(task => {
            const employees      = Array.isArray(task.employees) ? task.employees : [];
            const taskId         = task._id?.toString();
            const actions        = actionsByTask[taskId] || [];
            const assignedByName = task.assignedBy?.name || 'N/A';
            const taskName       = task.taskName?.name || 'Unknown Task';
            const projectName    = task.project?.name || 'N/A';

            if (employees.length === 0) {
              return [`
                <tr>
                  <td style="font-weight:600;color:#1e293b;">${assignedByName}</td>
                  <td><span style="color:#9ca3af;font-size:12px;">Unassigned</span></td>
                  <td>${getPriorityBadge(task.priority)}</td>
                  <td>
                    <div style="font-weight:600;color:#1e293b;">${taskName}</div>
                    <div style="font-size:11px;color:#6b7280;margin-top:2px;">📁 ${projectName}</div>
                    ${actions.length > 0 ? `<div style="font-size:11px;color:#6366f1;margin-top:2px;">📋 ${actions.length} action(s)</div>` : ''}
                  </td>
                  <td style="white-space:nowrap;">${formatPlainDate(task.startDate)}</td>
                  <td style="white-space:nowrap;">${formatPlainDate(task.endDate)}</td>
                  <td>${getProgressBar(task.taskLevel || 0)}</td>
                </tr>
              `];
            }

            return employees.map((emp, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'};">
                <td style="font-weight:600;color:#1e293b;">${assignedByName}</td>
                <td>
                  <span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">
                    👤 ${emp.name || 'Unknown'}
                  </span>
                </td>
                <td>${getPriorityBadge(task.priority)}</td>
                <td>
                  <div style="font-weight:600;color:#1e293b;">${taskName}</div>
                  <div style="font-size:11px;color:#6b7280;margin-top:2px;">📁 ${projectName}</div>
                  ${actions.length > 0 ? `<div style="font-size:11px;color:#6366f1;margin-top:2px;">📋 ${actions.length} action(s)</div>` : ''}
                </td>
                <td style="white-space:nowrap;">${formatPlainDate(task.startDate)}</td>
                <td style="white-space:nowrap;">${formatPlainDate(task.endDate)}</td>
                <td>${getProgressBar(task.taskLevel || 0)}</td>
              </tr>
            `);
          }).join('');
        };

        // ── Build action rows ──
        const buildActionRows = () => {
          return yesterdayActions.map((action, idx) => {
            const parentTask     = taskSheets.find(t => t._id?.toString() === action.task?.toString());
            const taskName       = parentTask?.taskName?.name || 'Unknown Task';
            const assignedByName = parentTask?.assignedBy?.name || 'N/A';
            const assignedToNames = (parentTask?.employees || [])
              .map(e => e.name).filter(Boolean).join(', ') || 'N/A';

            return `
              <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9fafb'};">
                <td style="font-weight:600;color:#1e293b;">${action.action || 'N/A'}</td>
                <td>
                  <span style="display:inline-block;background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">
                    🧑‍💻 ${action.actionBy?.name || 'N/A'}
                  </span>
                </td>
                <td style="font-weight:600;color:#1e293b;">${assignedByName}</td>
                <td>
                  <span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;">
                    👤 ${assignedToNames}
                  </span>
                </td>
                <td style="white-space:nowrap;font-size:12px;">${formatDateTime(action.startTime)}</td>
                <td style="white-space:nowrap;font-size:12px;">${formatDateTime(action.endTime)}</td>
                <td>${getProgressBar(action.complated || 0)}</td>
                <td style="font-weight:600;color:#1e293b;">${taskName}</td>
              </tr>
            `;
          }).join('');
        };

        // ── Email HTML ──
        const emailContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Daily Task Sheet Report</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f7fa; }
              .container { max-width: 1000px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .content { padding: 28px; }
              .section-title { font-size: 17px; font-weight: 700; margin: 28px 0 12px 0; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
              .report-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
              .report-table th, .report-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
              .report-table th { background: #f9fafb; font-weight: 700; color: #374151; white-space: nowrap; }
              .report-table tr:hover td { background: #f0f9ff; }
              .no-data { text-align:center; color:#9ca3af; padding:28px; font-style:italic; background:#f9fafb; border-radius:8px; margin-top:10px; }
              .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
            </style>
          </head>
          <body>
            <div class="container">

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);">
                <tr>
                  <td align="center" style="padding:30px;">
                    <img src="https://shorturl.at/DtkD8" alt="ProClient360" width="48" height="48" style="display:block;margin:0 auto 14px;">
                    <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;font-family:'Segoe UI',sans-serif;">
                      📋 Daily Task Sheet Report
                    </h1>
                    <p style="margin:8px 0 0;font-size:15px;color:#bfdbfe;font-family:'Segoe UI',sans-serif;">
                      ${companyName} &nbsp;|&nbsp; Yesterday: ${formatPlainDate(reportDate)}
                    </p>
                  </td>
                </tr>
              </table>

              <div class="content">

                <!-- Summary Stats -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;border-collapse:separate;border-spacing:8px;">
                  <tr>
                    <td width="19%" style="background:#EFF6FF;border-left:4px solid #3b82f6;border-radius:8px;padding:16px 10px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#3b82f6;">${totalTasks}</div>
                      <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Tasks Assigned</div>
                    </td>
                    <td width="19%" style="background:#ECFDF5;border-left:4px solid #10b981;border-radius:8px;padding:16px 10px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#10b981;">${completedTasks}</div>
                      <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Completed</div>
                    </td>
                    <td width="19%" style="background:#EEF2FF;border-left:4px solid #6366f1;border-radius:8px;padding:16px 10px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#6366f1;">${inProgressTasks}</div>
                      <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">In Progress</div>
                    </td>
                    <td width="19%" style="background:#F3F4F6;border-left:4px solid #9ca3af;border-radius:8px;padding:16px 10px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#6b7280;">${notStarted}</div>
                      <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Not Started</div>
                    </td>
                    <td width="19%" style="background:#FFF7ED;border-left:4px solid #f97316;border-radius:8px;padding:16px 10px;text-align:center;">
                      <div style="font-size:28px;font-weight:800;color:#f97316;">${totalActions}</div>
                      <div style="color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">Actions Done</div>
                    </td>
                  </tr>
                </table>

                <!-- Section 1: Tasks Created & Assigned Yesterday -->
                <h2 class="section-title">📌 Tasks Created & Assigned Yesterday (${formatPlainDate(reportDate)})</h2>
                ${totalTasks === 0
                  ? `<div class="no-data">No tasks were created or assigned on ${formatPlainDate(reportDate)}.</div>`
                  : `<div style="overflow-x:auto;">
                      <table class="report-table">
                        <thead>
                          <tr>
                            <th>Assigned By</th>
                            <th>Assign To</th>
                            <th>Priority</th>
                            <th>Task Name / Project</th>
                            <th>Start Date</th>
                            <th>End Date</th>
                            <th>Progress</th>
                          </tr>
                        </thead>
                        <tbody>${buildTaskRows()}</tbody>
                      </table>
                    </div>`
                }

                <!-- Section 2: Actions Performed Yesterday -->
                <h2 class="section-title">⚡ Actions Performed Yesterday (${formatPlainDate(reportDate)})</h2>
                ${totalActions === 0
                  ? `<div class="no-data">No actions were performed on yesterday's tasks.</div>`
                  : `<div style="overflow-x:auto;">
                      <table class="report-table">
                        <thead>
                          <tr>
                            <th>Action</th>
                            <th>Action By</th>
                            <th>Assigned By</th>
                            <th>Assign To</th>
                            <th>Start Time</th>
                            <th>End Time</th>
                            <th>Completion</th>
                            <th>Task Name</th>
                          </tr>
                        </thead>
                        <tbody>${buildActionRows()}</tbody>
                      </table>
                    </div>`
                }

              </div>

              <!-- Footer -->
              <div class="footer">
                <p>© ${new Date().getFullYear()} ProClient360. All rights reserved.</p>
                <p>This automated report is sent at <strong>9:30 AM daily (IST)</strong> and covers tasks created & assigned the previous day.</p>
                ${!isScheduledRun ? '<p>🔍 Preview Mode — Emails not sent.</p>' : ''}
              </div>
            </div>
          </body>
          </html>
        `;

        const recipientEmails = recipients
          .map(r => r.email)
          .filter(e => e && e.includes('@'));

        if (recipientEmails.length > 0 && isScheduledRun) {
          const mailOptions = {
            from: `ProClient360 <${process.env.EMAIL}>`,
            subject: `📋 Daily Task Sheet Report — ${companyName} — ${formatPlainDate(reportDate)}`,
            html: emailContent
          };
          await sendEmailInBatches(recipientEmails, mailOptions, companyName);
        } else if (recipientEmails.length === 0) {
          console.log(`No valid emails for company ${companyId}`);
        } else {
          console.log(`🔍 PREVIEW MODE: Email generated but not sent`);
        }

        if (ci < companies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

      } catch (companyError) {
        console.error(`Error processing company ${companyId}:`, companyError.message);
      }
    }

    console.log('=== Daily task sheet report completed at:', new Date().toISOString(), '===');
    return true;
  } catch (error) {
    console.error('Error in sendDailyTaskSheetReport:', error.message);
    return false;
  }
};

// ── Scheduler ──
let scheduledTask = null;

const initializeDailyTaskSheetReportScheduler = () => {
  if (scheduledTask) {
    scheduledTask.destroy();
  }

  // ✅ 9:30 AM IST daily
  scheduledTask = cron.schedule('30 9 * * *', async () => {
    console.log('⏰ CRON JOB: Running daily task sheet report at:', new Date().toISOString());
    const result = await sendDailyTaskSheetReport(true);
    console.log(result ? '✅ Daily task sheet report sent.' : '❌ Failed to send task sheet report.');
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  console.log('📅 Daily task sheet report scheduler initialized — runs at 9:30 AM IST daily.');

  if (process.env.NODE_ENV === 'development') {
    setTimeout(async () => {
      console.log('🚀 DEV MODE: Running task sheet report for testing...');
      await sendDailyTaskSheetReport(true);
    }, 15000);
  }
};

module.exports = {
  sendDailyTaskSheetReport,
  initializeDailyTaskSheetReportScheduler
};