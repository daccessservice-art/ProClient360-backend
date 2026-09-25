/**
 * mailsService/weeklyWorkReport.js   (NEW FILE)
 *
 * Every FRIDAY at 6:30 PM IST, for all employees in the IT, AI and Design
 * departments:
 *
 *  1) MANAGEMENT MAIL (one per company) → sent to everyone holding a
 *     designation in MANAGEMENT_DESIGNATIONS. Shows EVERY employee:
 *     what they completed this week, what they worked on, hours logged,
 *     open / overdue tasks, testing done, and sub-tasks they gave juniors.
 *
 *  2) EMPLOYEE MAIL (one per employee) → sent ONLY to that employee.
 *     Contains ONLY their own work. No other employee's data is included.
 *
 * Week window = last 7 days (previous Friday 6:30 PM → this Friday 6:30 PM).
 * Per-employee progress on shared tasks is read from each employee's own
 * Action history, so one employee finishing a shared task does not mark
 * the others as completed.
 */

const cron = require('node-cron');
const mongoose = require('mongoose');
const transporter = require('./emailTransporter');
const Employee = require('../models/employeeModel');
const Designation = require('../models/designationModel');
const TaskSheet = require('../models/taskSheetModel');

// ✅ SAFE — Department model is loaded lazily inside the report run.
// If the model file name is different in your project, this can NEVER crash
// the server or affect any other mail/scheduler — only this report is skipped.
const getDepartmentModel = () => {
  if (mongoose.models.Department) return mongoose.models.Department;
  try {
    return require('../models/departmentModel');
  } catch (e) {
    console.error('Weekly report: Department model not found —', e.message);
    return null;
  }
};
const Action = require('../models/actionModel');

// ── Who receives the MANAGEMENT mail ──
const MANAGEMENT_DESIGNATIONS = [
  'Director Customer Delight',
  'CEO',
  'Director Digi Solution',
  'Junior Software Developer',
  'Sales Manager',
  'Marketing',
  'Executive Director-Project',
  'Project Manager-Software', // ✅ NEW
];

// ── Which departments are covered by this report ──
const REPORT_DEPARTMENTS = ['IT', 'AI', 'Design'];

const DELAY_BETWEEN_EMPLOYEE_MAILS_MS = 2000;
const DELAY_BETWEEN_COMPANIES_MS = 10000;

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const formatIST = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
  });
};

const getWeekRange = () => {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
};

const isReportDepartment = (name) => {
  const n = (name || '').trim().toLowerCase();
  return REPORT_DEPARTMENTS.some(d => {
    const k = d.toLowerCase();
    return n === k || new RegExp(`\\b${k}\\b`).test(n);
  });
};

const idStr = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

// Each employee's own highest logged % per task (all time)
// → { [taskId]: { [employeeId]: level } }
const buildEmployeeProgressMap = async (taskIds) => {
  if (!taskIds || taskIds.length === 0) return {};
  const rows = await Action.aggregate([
    { $match: { task: { $in: taskIds } } },
    {
      $group: {
        _id: { task: '$task', actionBy: '$actionBy' },
        level: { $max: { $convert: { input: '$complated', to: 'double', onError: 0, onNull: 0 } } }
      }
    }
  ]);
  const map = {};
  rows.forEach(r => {
    if (!r._id?.task || !r._id?.actionBy) return;
    const t = r._id.task.toString();
    if (!map[t]) map[t] = {};
    map[t][r._id.actionBy.toString()] = Math.min(100, r.level || 0);
  });
  return map;
};

const ownLevel = (task, empId, progressMap) => {
  if (!task) return 0;
  if (task.qaStatus === 'passed') return 100;
  const own = Number(progressMap[idStr(task)]?.[empId] || 0);
  const count = Array.isArray(task.employees) ? task.employees.length : 0;
  if (count <= 1) return Math.max(own, task.taskLevel || 0);
  return own;
};

const progressBar = (lvl) => {
  const v = Math.max(0, Math.min(100, Number(lvl) || 0));
  const color = v === 100 ? '#16a34a' : v > 50 ? '#2563eb' : '#f59e0b';
  return `
    <span style="display:inline-block;width:80px;height:6px;background:#e5e7eb;border-radius:4px;vertical-align:middle;">
      <span style="display:block;width:${v}%;height:6px;background:${color};border-radius:4px;"></span>
    </span>
    <b style="font-size:12px;margin-left:4px;">${v}%</b>`;
};

const taskLabel = (task) => {
  const name = esc(task?.taskName?.name || 'Task');
  const sub = task?.subtaskName ? ` <span style="color:#6b7280;">› ${esc(task.subtaskName)}</span>` : '';
  const badge = task?.assignedByRole === 'teamlead'
    ? ` <span style="background:#dcfce7;color:#166534;font-size:10px;padding:1px 6px;border-radius:8px;">Sub-task</span>`
    : '';
  return `${name}${sub}${badge}`;
};

const sendMail = (options) => new Promise((resolve) => {
  // ✅ TEST MODE — if WEEKLY_REPORT_TEST_EMAIL is set in .env, EVERY weekly
  // mail (management + all employees) goes ONLY to that address, with the
  // real recipient shown in the subject. Nobody else receives anything.
  const testEmail = (process.env.WEEKLY_REPORT_TEST_EMAIL || '').trim();
  if (testEmail) {
    options = {
      ...options,
      subject: `[TEST → ${options.to}] ${options.subject}`,
      to: testEmail,
    };
  }

  transporter.sendMail(options, (error, info) => {
    if (error) {
      console.error(`❌ Weekly report mail failed (${options.to}):`, error.message);
      resolve(false);
    } else {
      resolve(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════
//  Build one employee's weekly data
// ══════════════════════════════════════════════════════════════
const buildEmployeeReport = (emp, ctx) => {
  const { start, end, weekActions, allTasks, taskById, progressMap, testedTasks, teamSubTasks } = ctx;
  const id = emp._id.toString();
  const inWeek = (d) => d && new Date(d) >= start && new Date(d) <= end;
  const now = new Date();

  // Actions this employee logged this week
  const myActions = weekActions.filter(a => idStr(a.actionBy) === id && a.task);

  // Hours logged
  let hours = 0;
  myActions.forEach(a => {
    const s = new Date(a.startTime), e = new Date(a.endTime);
    if (!isNaN(s) && !isNaN(e) && e > s) hours += (e - s) / 36e5;
  });

  // ✅ Completed this week (their own work reached 100%, or tester passed it)
  const completedMap = {};
  myActions.forEach(a => {
    if (Number(a.complated) >= 100) {
      const k = idStr(a.task);
      completedMap[k] = { task: taskById[k] || a.task, date: a.endTime, note: a.action };
    }
  });

  const myTasks = allTasks.filter(t => (t.employees || []).some(e => idStr(e) === id));
  myTasks.forEach(t => {
    const k = idStr(t);
    if (t.qaStatus === 'passed' && inWeek(t.testEndDate)) {
      completedMap[k] = { ...(completedMap[k] || { task: t, date: t.testEndDate }), passedByTester: true };
    }
  });
  const completed = Object.values(completedMap).sort((a, b) => new Date(a.date) - new Date(b.date));

  // 🔧 Worked on this week but not completed
  const workedMap = {};
  myActions.forEach(a => {
    const k = idStr(a.task);
    if (completedMap[k]) return;
    if (!workedMap[k]) workedMap[k] = { task: taskById[k] || a.task, updates: 0, lastNote: '', lastDate: null };
    workedMap[k].updates++;
    if (!workedMap[k].lastDate || new Date(a.endTime) > new Date(workedMap[k].lastDate)) {
      workedMap[k].lastDate = a.endTime;
      workedMap[k].lastNote = a.action || '';
    }
  });
  const worked = Object.entries(workedMap).map(([k, w]) => ({
    ...w,
    level: ownLevel(taskById[k] || w.task, id, progressMap),
  }));

  // 📌 Open tasks + overdue
  const openTasks = myTasks.filter(t => ownLevel(t, id, progressMap) < 100 && t.qaStatus !== 'passed');
  const overdueCount = openTasks.filter(t => t.endDate && new Date(t.endDate) < now).length;
  const idle = openTasks
    .filter(t => !workedMap[idStr(t)])
    .map(t => {
      const due = t.endDate ? new Date(t.endDate) : null;
      const daysOverdue = due && due < now ? Math.floor((now - due) / 864e5) : 0;
      return { task: t, level: ownLevel(t, id, progressMap), daysOverdue };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // 🧪 Testing this employee finished this week (as tester)
  const testsDone = testedTasks
    .filter(t => idStr(t.assignedTester) === id)
    .map(t => ({ task: t, result: t.qaStatus === 'passed' ? 'Passed' : t.qaStatus === 'bug_found' ? 'Bug reported' : t.qaStatus }));

  // 👥 Sub-tasks this employee (as senior) gave to juniors
  const team = teamSubTasks
    .filter(st => idStr(st.assignedBy) === id)
    .map(st => ({
      task: st,
      juniors: (st.employees || []).map(j => ({
        name: j.name || 'Employee',
        level: ownLevel(st, idStr(j), progressMap),
      })),
    }))
    .filter(x => inWeek(x.task.updatedAt) || x.juniors.some(j => j.level < 100));

  return {
    emp,
    deptName: emp.department?.name || '-',
    designationName: emp.designation?.name || '-',
    hours: Math.round(hours * 10) / 10,
    completed,
    worked,
    idle,
    openCount: openTasks.length,
    overdueCount,
    testsDone,
    team,
  };
};

// ══════════════════════════════════════════════════════════════
//  HTML builders
// ══════════════════════════════════════════════════════════════
const statCell = (num, label, bg, color) => `
  <td style="background:${bg};border-radius:8px;padding:10px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:${color};">${num}</div>
    <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:600;">${label}</div>
  </td>`;

const statsRow = (r) => `
  <table width="100%" cellspacing="6" cellpadding="0" style="margin-bottom:14px;"><tr>
    ${statCell(r.completed.length, 'Completed', '#dcfce7', '#166534')}
    ${statCell(r.worked.length, 'Worked On', '#dbeafe', '#1e40af')}
    ${statCell(r.hours, 'Hours Logged', '#f3e8ff', '#6b21a8')}
    ${statCell(r.openCount, 'Open Tasks', '#fef3c7', '#92400e')}
    ${statCell(r.overdueCount, 'Overdue', '#fee2e2', '#991b1b')}
  </tr></table>`;

const sectionTitle = (text, color) =>
  `<h3 style="font-size:14px;color:${color};border-left:4px solid ${color};padding-left:8px;margin:16px 0 8px;">${text}</h3>`;

const emptyLine = (text) => `<p style="font-size:12.5px;color:#9ca3af;margin:4px 0 8px;">${text}</p>`;

const buildEmployeeDetail = (r) => {
  const completedHtml = r.completed.length === 0 ? emptyLine('No task completed this week.') : `
    <table class="t"><thead><tr><th>Task</th><th>Project</th><th>Completed On</th><th>Note</th></tr></thead><tbody>
      ${r.completed.map(c => `<tr>
        <td>${taskLabel(c.task)}</td>
        <td>${esc(c.task?.project?.name || '-')}</td>
        <td>${formatIST(c.date)}</td>
        <td>${c.passedByTester ? '<span style="color:#166534;font-weight:700;">✓ Passed by tester</span> ' : ''}${esc(c.note || '')}</td>
      </tr>`).join('')}
    </tbody></table>`;

  const workedHtml = r.worked.length === 0 ? emptyLine('No in-progress updates this week.') : `
    <table class="t"><thead><tr><th>Task</th><th>Project</th><th>Progress</th><th>Updates</th><th>Latest Work</th></tr></thead><tbody>
      ${r.worked.map(w => `<tr>
        <td>${taskLabel(w.task)}</td>
        <td>${esc(w.task?.project?.name || '-')}</td>
        <td style="white-space:nowrap;">${progressBar(w.level)}</td>
        <td style="text-align:center;">${w.updates}</td>
        <td>${esc(w.lastNote)}</td>
      </tr>`).join('')}
    </tbody></table>`;

  const idleHtml = r.idle.length === 0 ? '' : `
    ${sectionTitle(`⏸️ Open Tasks With No Update This Week (${r.idle.length})`, '#92400e')}
    <table class="t"><thead><tr><th>Task</th><th>Project</th><th>Due</th><th>Progress</th></tr></thead><tbody>
      ${r.idle.map(i => `<tr>
        <td>${taskLabel(i.task)}</td>
        <td>${esc(i.task?.project?.name || '-')}</td>
        <td>${formatIST(i.task?.endDate)}${i.daysOverdue > 0 ? ` <span style="color:#991b1b;font-weight:700;">(${i.daysOverdue}d overdue)</span>` : ''}</td>
        <td style="white-space:nowrap;">${progressBar(i.level)}</td>
      </tr>`).join('')}
    </tbody></table>`;

  const testsHtml = r.testsDone.length === 0 ? '' : `
    ${sectionTitle(`🧪 Testing Done (${r.testsDone.length})`, '#0e7490')}
    <table class="t"><thead><tr><th>Task</th><th>Project</th><th>Developer(s)</th><th>Result</th></tr></thead><tbody>
      ${r.testsDone.map(t => `<tr>
        <td>${taskLabel(t.task)}</td>
        <td>${esc(t.task?.project?.name || '-')}</td>
        <td>${esc((t.task?.employees || []).map(e => e.name).join(', ') || '-')}</td>
        <td style="font-weight:700;color:${t.result === 'Passed' ? '#166534' : '#991b1b'};">${esc(t.result)}</td>
      </tr>`).join('')}
    </tbody></table>`;

  const teamHtml = r.team.length === 0 ? '' : `
    ${sectionTitle(`👥 Sub-Tasks Given to Juniors (${r.team.length})`, '#166534')}
    <table class="t"><thead><tr><th>Sub-Task</th><th>Project</th><th>Due</th><th>Junior Progress</th></tr></thead><tbody>
      ${r.team.map(x => `<tr>
        <td>${taskLabel(x.task)}</td>
        <td>${esc(x.task?.project?.name || '-')}</td>
        <td>${formatIST(x.task?.endDate)}</td>
        <td>${x.juniors.map(j => `<div style="margin:2px 0;">${esc(j.name)}: ${progressBar(j.level)}</div>`).join('')}</td>
      </tr>`).join('')}
    </tbody></table>`;

  return `
    ${statsRow(r)}
    ${sectionTitle(`✅ Completed This Week (${r.completed.length})`, '#166534')}
    ${completedHtml}
    ${sectionTitle(`🔧 Worked On This Week (${r.worked.length})`, '#1e40af')}
    ${workedHtml}
    ${idleHtml}
    ${testsHtml}
    ${teamHtml}
  `;
};

const wrapEmail = (title, subtitle, body, isScheduledRun) => `
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
      .content { padding:20px 30px; }
      .t { width:100%; border-collapse:collapse; margin-bottom:8px; }
      .t th, .t td { padding:7px 9px; text-align:left; border-bottom:1px solid #e5e7eb; font-size:12.5px; vertical-align:top; }
      .t th { background:#f9fafb; font-weight:600; color:#374151; }
      .emp-block { border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; margin-bottom:18px; }
      .emp-head { font-size:15px; font-weight:700; color:#0f3460; margin-bottom:8px; }
      .emp-sub { font-size:12px; color:#6b7280; font-weight:400; }
      .footer { background:#f9fafb; padding:16px 30px; text-align:center; font-size:12px; color:#6b7280; border-top:1px solid #e5e7eb; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      <div class="content">
        ${!isScheduledRun ? '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:18px;color:#92400e;font-size:13px;">⚠️ PREVIEW MODE — email not actually sent.</div>' : ''}
        ${body}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} ProClient360. Automated weekly report — every Friday at 6:30 PM IST.</p>
      </div>
    </div>
  </body>
  </html>
`;

// Management: summary table of every employee, grouped by department
const buildManagementSummary = (reports) => {
  const byDept = {};
  reports.forEach(r => {
    if (!byDept[r.deptName]) byDept[r.deptName] = [];
    byDept[r.deptName].push(r);
  });

  return Object.entries(byDept).map(([dept, list]) => `
    <h2 style="font-size:16px;font-weight:700;color:#0f3460;border-left:4px solid #0f3460;padding-left:10px;margin:18px 0 10px;">
      🏢 ${esc(dept)} Department (${list.length})
    </h2>
    <table class="t">
      <thead><tr>
        <th>Employee</th><th>Designation</th>
        <th style="text-align:center;">Completed</th><th style="text-align:center;">Worked On</th>
        <th style="text-align:center;">Hours</th><th style="text-align:center;">Open</th>
        <th style="text-align:center;">Overdue</th><th style="text-align:center;">Tests Done</th>
      </tr></thead>
      <tbody>
        ${list
          .sort((a, b) => b.completed.length - a.completed.length)
          .map(r => `<tr>
            <td style="font-weight:600;">👤 ${esc(r.emp.name)}</td>
            <td>${esc(r.designationName)}</td>
            <td style="text-align:center;color:#166534;font-weight:700;">${r.completed.length}</td>
            <td style="text-align:center;">${r.worked.length}</td>
            <td style="text-align:center;">${r.hours}</td>
            <td style="text-align:center;">${r.openCount}</td>
            <td style="text-align:center;${r.overdueCount > 0 ? 'color:#991b1b;font-weight:700;' : ''}">${r.overdueCount}</td>
            <td style="text-align:center;">${r.testsDone.length}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `).join('');
};

// ══════════════════════════════════════════════════════════════
//  Main sender
// ══════════════════════════════════════════════════════════════
const sendWeeklyWorkReport = async (isScheduledRun = false) => {
  try {
    console.log('=== Starting Weekly Work Report at:', new Date().toISOString(), '===');
    const { start, end } = getWeekRange();
    const rangeLabel = `${formatIST(start)} – ${formatIST(end)}`;

    // 1) Find IT / AI / Design departments
    const Department = getDepartmentModel();
    if (!Department) return false;
    const allDepts = await Department.find({}).select('name').lean();
    const deptIds = allDepts.filter(d => isReportDepartment(d.name)).map(d => d._id);
    if (deptIds.length === 0) {
      console.log(`No departments matching ${REPORT_DEPARTMENTS.join(', ')} — weekly report skipped`);
      return false;
    }

    // 2) Management designations
    const mgmtDesignations = await Designation.find({ name: { $in: MANAGEMENT_DESIGNATIONS } }).select('_id');
    const mgmtDesignationIds = mgmtDesignations.map(d => d._id);

    // 3) Companies that have employees in these departments
    const companies = await Employee.distinct('company', { department: { $in: deptIds } });
    console.log(`Weekly report: ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} to process`);

    for (let ci = 0; ci < companies.length; ci++) {
      const companyId = companies[ci];
      try {
        const employees = await Employee.find({ company: companyId, department: { $in: deptIds } })
          .select('name email department designation')
          .populate('department', 'name')
          .populate('designation', 'name')
          .lean();

        if (employees.length === 0) continue;
        const empIds = employees.map(e => e._id);

        // Actions logged this week by these employees
        const weekActions = await Action.find({
          actionBy: { $in: empIds },
          endTime: { $gte: start, $lte: end },
        })
          .populate({
            path: 'task',
            select: 'taskName subtaskName project assignedByRole employees taskLevel qaStatus endDate',
            populate: [{ path: 'taskName', select: 'name' }, { path: 'project', select: 'name' }],
          })
          .sort({ endTime: 1 })
          .lean();

        // All tasks assigned to these employees
        const allTasks = await TaskSheet.find({ company: companyId, employees: { $in: empIds } })
          .populate('taskName', 'name')
          .populate('project', 'name')
          .populate('employees', 'name')
          .lean();

        // Testing these employees finished this week (as tester)
        const testedTasks = await TaskSheet.find({
          company: companyId,
          assignedTester: { $in: empIds },
          testEndDate: { $gte: start, $lte: end },
        })
          .populate('taskName', 'name')
          .populate('project', 'name')
          .populate('employees', 'name')
          .lean();

        // Sub-tasks these employees (as seniors) gave to juniors
        const teamSubTasks = await TaskSheet.find({
          company: companyId,
          assignedBy: { $in: empIds },
          assignedByRole: 'teamlead',
        })
          .populate('taskName', 'name')
          .populate('project', 'name')
          .populate('employees', 'name')
          .lean();

        const taskById = {};
        [...allTasks, ...teamSubTasks, ...testedTasks].forEach(t => { taskById[idStr(t)] = t; });

        const progressMap = await buildEmployeeProgressMap(Object.keys(taskById).map(k => new mongoose.Types.ObjectId(k)));

        const ctx = { start, end, weekActions, allTasks, taskById, progressMap, testedTasks, teamSubTasks };
        const reports = employees.map(emp => buildEmployeeReport(emp, ctx));

        // Company name
        let companyName = 'Company';
        try {
          const CompanyModel = mongoose.models.Company;
          const companyDoc = CompanyModel ? await CompanyModel.findById(companyId).select('name').lean() : null;
          if (companyDoc?.name) companyName = companyDoc.name;
        } catch (e) { /* keep default */ }

        const totalCompleted = reports.reduce((s, r) => s + r.completed.length, 0);
        const totalOverdue = reports.reduce((s, r) => s + r.overdueCount, 0);
        const totalHours = Math.round(reports.reduce((s, r) => s + r.hours, 0) * 10) / 10;

        // ── A) MANAGEMENT MAIL ─────────────────────────────────────
        const mgmtRecipients = await Employee.find({
          company: companyId,
          designation: { $in: mgmtDesignationIds },
          email: { $exists: true, $ne: '' },
        }).select('email').lean();
        const mgmtEmails = [...new Set(mgmtRecipients.map(r => r.email).filter(e => e && e.includes('@')))];

        const mgmtBody = `
          <table width="100%" cellspacing="6" cellpadding="0" style="margin-bottom:10px;"><tr>
            ${statCell(employees.length, 'Employees', '#e0e7ff', '#3730a3')}
            ${statCell(totalCompleted, 'Tasks Completed', '#dcfce7', '#166534')}
            ${statCell(totalHours, 'Hours Logged', '#f3e8ff', '#6b21a8')}
            ${statCell(totalOverdue, 'Overdue Tasks', '#fee2e2', '#991b1b')}
          </tr></table>
          ${buildManagementSummary(reports)}
          <h2 style="font-size:16px;font-weight:700;color:#0f3460;border-left:4px solid #0f3460;padding-left:10px;margin:26px 0 12px;">
            📋 Employee-wise Details
          </h2>
          ${reports.map(r => `
            <div class="emp-block">
              <div class="emp-head">👤 ${esc(r.emp.name)} <span class="emp-sub">— ${esc(r.designationName)} · ${esc(r.deptName)}</span></div>
              ${buildEmployeeDetail(r)}
            </div>
          `).join('')}
        `;

        const mgmtHtml = wrapEmail(
          '📊 Weekly Work Report — IT / AI / Design',
          `${esc(companyName)} — ${rangeLabel}`,
          mgmtBody,
          isScheduledRun
        );

        if (mgmtEmails.length > 0 && isScheduledRun) {
          const ok = await sendMail({
            from: `ProClient360 <${process.env.EMAIL}>`,
            to: mgmtEmails.join(','),
            subject: `Weekly Work Report — ${companyName} — ${rangeLabel} — Completed:${totalCompleted} Overdue:${totalOverdue}`,
            html: mgmtHtml,
          });
          if (ok) console.log(`✅ Management weekly report sent to ${mgmtEmails.length} recipient(s) for ${companyName}`);
        } else if (mgmtEmails.length === 0) {
          console.log(`No management recipients for company ${companyId}`);
        } else {
          console.log(`🔍 PREVIEW: management report would go to ${mgmtEmails.join(', ')}`);
        }

        // ── B) EMPLOYEE MAILS — each employee gets ONLY their own report ──
        for (const r of reports) {
          const email = r.emp.email;
          if (!email || !email.includes('@')) continue;

          const empHtml = wrapEmail(
            `📝 Your Weekly Work Report`,
            `${esc(r.emp.name)} — ${rangeLabel}`,
            buildEmployeeDetail(r),
            isScheduledRun
          );

          if (isScheduledRun) {
            await sendMail({
              from: `ProClient360 <${process.env.EMAIL}>`,
              to: email, // ✅ only this employee
              subject: `Your Weekly Work Report — ${rangeLabel} — Completed:${r.completed.length}`,
              html: empHtml,
            });
            await sleep(DELAY_BETWEEN_EMPLOYEE_MAILS_MS);
          } else {
            console.log(`🔍 PREVIEW: ${r.emp.name} <${email}> — completed ${r.completed.length}, worked ${r.worked.length}, overdue ${r.overdueCount}`);
          }
        }
        console.log(`✅ Employee weekly reports processed for ${companyName} (${reports.length} employees)`);

        if (ci < companies.length - 1) await sleep(DELAY_BETWEEN_COMPANIES_MS);
      } catch (companyError) {
        console.error(`Weekly report error for company ${companyId}:`, companyError.message);
      }
    }

    console.log('=== Weekly Work Report completed at:', new Date().toISOString(), '===');
    return true;
  } catch (error) {
    console.error('Error in sendWeeklyWorkReport:', error.message);
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
//  Scheduler — every FRIDAY at 6:30 PM IST
// ══════════════════════════════════════════════════════════════
let scheduledTask = null;

const initializeWeeklyWorkReportScheduler = () => {
  if (scheduledTask) scheduledTask.destroy();

  scheduledTask = cron.schedule('30 18 * * 5', async () => {
    console.log('⏰ CRON JOB: Running Weekly Work Report at:', new Date().toISOString());
    const result = await sendWeeklyWorkReport(true);
    console.log(result ? '✅ CRON JOB: Weekly Work Report done.' : '❌ CRON JOB: Weekly Work Report failed.');
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('📅 Weekly Work Report scheduler initialized — runs every Friday at 6:30 PM IST.');
};

module.exports = {
  sendWeeklyWorkReport,
  initializeWeeklyWorkReportScheduler,
};