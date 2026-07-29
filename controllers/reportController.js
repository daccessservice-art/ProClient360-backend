const ExcelJS = require('exceljs');
const TaskSheet = require('../models/taskSheetModel');
const Employee = require('../models/employeeModel');
const Project = require('../models/projectModel');

// ─── Colors used for styling ────────────────────────────────────────────────
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
const OVERDUE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
const COMPLETED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7EC' } };
const TOP_PERFORMER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } };

const isOverdue = (task) => {
  if (!task.endDate) return false;
  if (task.taskStatus === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(task.endDate);
  end.setHours(0, 0, 0, 0);
  return end < today;
};

// ─── GET /api/reports/task-status ──────────────────────────────────────────
exports.generateTaskStatusReport = async (req, res) => {
  try {
    const user = req.user;
    const { projectId, status, from, to } = req.query;

    const query = {
      company: user.company ? user.company : user._id,
    };

    if (user.company) {
      try {
        const employeeDoc = await Employee.findById(user._id).populate('designation');
        const hasViewTaskSheet = employeeDoc?.designation?.permissions?.includes('viewTaskSheet');
        if (!hasViewTaskSheet) {
          query.employees = user._id;
        }
      } catch (err) {
        query.employees = user._id;
      }
    }

    if (projectId) query.project = projectId;
    if (status && ['upcoming', 'inprocess', 'completed', 'stuck'].includes(status)) {
      query.taskStatus = status;
    }
    if (from || to) {
      query.endDate = {};
      if (from) query.endDate.$gte = new Date(from);
      if (to) query.endDate.$lte = new Date(to);
    }

    const tasks = await TaskSheet.find(query)
      .populate('project', 'name')
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .populate('assignedBy', 'name')
      .sort({ endDate: 1 })
      .lean();

    const summary = {
      total: tasks.length,
      completed: 0,
      inprocess: 0,
      stuck: 0,
      upcoming: 0,
      overdue: 0,
    };
    tasks.forEach(t => {
      if (summary[t.taskStatus] !== undefined) summary[t.taskStatus] += 1;
      if (isOverdue(t)) summary.overdue += 1;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Count', key: 'count', width: 15 },
    ];
    summarySheet.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });
    [
      ['Total Tasks', summary.total],
      ['Completed', summary.completed],
      ['In Process', summary.inprocess],
      ['Stuck', summary.stuck],
      ['Upcoming', summary.upcoming],
      ['Overdue (past end date, not completed)', summary.overdue],
      ['Report Generated', new Date().toLocaleString()],
    ].forEach(row => summarySheet.addRow(row));

    const detailSheet = workbook.addWorksheet('Task Detail');
    detailSheet.columns = [
      { header: 'Project', key: 'project', width: 28 },
      { header: 'Task Name', key: 'taskName', width: 25 },
      { header: 'Employees', key: 'employees', width: 25 },
      { header: 'Assigned By', key: 'assignedBy', width: 20 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Task Level (%)', key: 'taskLevel', width: 14 },
      { header: 'QA Status', key: 'qaStatus', width: 14 },
      { header: 'Overdue', key: 'overdue', width: 10 },
      { header: 'Remark', key: 'remark', width: 30 },
    ];
    detailSheet.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });

    tasks.forEach(task => {
      const overdue = isOverdue(task);
      const row = detailSheet.addRow({
        project: task.project?.name || 'N/A',
        taskName: task.taskName?.name || 'N/A',
        employees: (task.employees || []).map(e => e.name).join(', ') || 'N/A',
        assignedBy: task.assignedBy?.name || 'N/A',
        startDate: task.startDate ? new Date(task.startDate).toLocaleDateString() : '',
        endDate: task.endDate ? new Date(task.endDate).toLocaleDateString() : '',
        status: task.taskStatus,
        taskLevel: task.taskLevel,
        qaStatus: task.qaStatus || 'none',
        overdue: overdue ? 'Yes' : 'No',
        remark: task.remark || '',
      });

      if (overdue) {
        row.eachCell(cell => { cell.fill = OVERDUE_FILL; });
      } else if (task.taskStatus === 'completed') {
        row.eachCell(cell => { cell.fill = COMPLETED_FILL; });
      }
    });

    detailSheet.autoFilter = { from: 'A1', to: `K${tasks.length + 1}` };

    const filename = `Task_Status_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating task status report:', error);
    res.status(500).json({ error: 'Error generating report: ' + error.message });
  }
};

// ─── NEW: GET /api/reports/employee-growth ──────────────────────────────────
// Manager-facing report: one row per employee showing how they're actually
// performing — completion rate, average days to finish a task, overdue
// count, and QA first-pass rate (submitted and approved without a bug
// round). Filterable by task start date range.
//
// SECURITY: this aggregates data across ALL employees in the company, so
// it is intentionally restricted to callers with the 'viewTaskSheet'
// permission (or the company account itself) — a regular employee without
// that permission gets a 403, they never see teammates' performance data.
exports.generateEmployeeGrowthReport = async (req, res) => {
  try {
    const user = req.user;
    const { from, to } = req.query;

    const companyId = user.company ? user.company : user._id;

    if (user.company) {
      try {
        const employeeDoc = await Employee.findById(user._id).populate('designation');
        const hasPermission = employeeDoc?.designation?.permissions?.includes('viewTaskSheet');
        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            error: "You do not have permission to view this report"
          });
        }
      } catch (err) {
        return res.status(403).json({ success: false, error: "Permission check failed" });
      }
    }

    const query = { company: companyId };
    if (from || to) {
      query.startDate = {};
      if (from) query.startDate.$gte = new Date(from);
      if (to) query.startDate.$lte = new Date(to);
    }

    const tasks = await TaskSheet.find(query)
      .populate('employees', 'name email')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const statsByEmployee = new Map();

    tasks.forEach(task => {
      (task.employees || []).forEach(emp => {
        if (!emp?._id) return;
        const key = emp._id.toString();

        if (!statsByEmployee.has(key)) {
          statsByEmployee.set(key, {
            name: emp.name || 'Unknown',
            email: emp.email || '',
            totalTasks: 0,
            completedTasks: 0,
            activeTasks: 0,
            overdueTasks: 0,
            completionDaysSum: 0,
            completionDaysCount: 0,
            testedCount: 0,
            passedFirstTry: 0,
            bugRoundsTotal: 0,
          });
        }

        const s = statsByEmployee.get(key);
        s.totalTasks += 1;

        if (task.taskStatus === 'completed') {
          s.completedTasks += 1;
          const completedAt = task.actualEndDate || task.updatedAt;
          if (completedAt && task.startDate) {
            const days = (new Date(completedAt) - new Date(task.startDate)) / (1000 * 60 * 60 * 24);
            if (days >= 0) {
              s.completionDaysSum += days;
              s.completionDaysCount += 1;
            }
          }
        } else {
          s.activeTasks += 1;
        }

        if (isOverdue(task)) {
          s.overdueTasks += 1;
        }

        if (task.qaStatus && task.qaStatus !== 'none') {
          s.testedCount += 1;
          if (task.qaStatus === 'passed' && (task.testCycles || 0) === 0) {
            s.passedFirstTry += 1;
          }
          s.bugRoundsTotal += task.testCycles || 0;
        }
      });
    });

    const rows = Array.from(statsByEmployee.values()).map(s => ({
      ...s,
      completionRate: s.totalTasks ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0,
      avgDaysToComplete: s.completionDaysCount ? Math.round((s.completionDaysSum / s.completionDaysCount) * 10) / 10 : null,
      qaFirstPassRate: s.testedCount ? Math.round((s.passedFirstTry / s.testedCount) * 100) : null,
    }));

    // Highest completion rate first, so managers see top performers at a glance
    rows.sort((a, b) => b.completionRate - a.completionRate);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Employee Growth');
    sheet.columns = [
      { header: 'Employee', key: 'name', width: 22 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Total Tasks', key: 'totalTasks', width: 12 },
      { header: 'Completed', key: 'completedTasks', width: 12 },
      { header: 'Active', key: 'activeTasks', width: 10 },
      { header: 'Overdue (current)', key: 'overdueTasks', width: 16 },
      { header: 'Completion Rate (%)', key: 'completionRate', width: 18 },
      { header: 'Avg Days to Complete', key: 'avgDaysToComplete', width: 18 },
      { header: 'Tasks Tested by QA', key: 'testedCount', width: 16 },
      { header: 'QA First-Pass Rate (%)', key: 'qaFirstPassRate', width: 20 },
      { header: 'Total Bug Rounds', key: 'bugRoundsTotal', width: 14 },
    ];
    sheet.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });

    rows.forEach((r, idx) => {
      const row = sheet.addRow({
        name: r.name,
        email: r.email,
        totalTasks: r.totalTasks,
        completedTasks: r.completedTasks,
        activeTasks: r.activeTasks,
        overdueTasks: r.overdueTasks,
        completionRate: r.completionRate,
        avgDaysToComplete: r.avgDaysToComplete ?? 'N/A',
        testedCount: r.testedCount,
        qaFirstPassRate: r.qaFirstPassRate ?? 'N/A',
        bugRoundsTotal: r.bugRoundsTotal,
      });

      if (idx < 3 && r.completionRate > 0) {
        row.eachCell(cell => { cell.fill = TOP_PERFORMER_FILL; });
      }
      if (r.overdueTasks > 0) {
        row.getCell('overdueTasks').fill = OVERDUE_FILL;
      }
    });

    sheet.autoFilter = { from: 'A1', to: `K${rows.length + 1}` };

    const filename = `Employee_Growth_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating employee growth report:', error);
    res.status(500).json({ error: 'Error generating report: ' + error.message });
  }
};

// ─── NEW: GET /api/reports/project-progress ─────────────────────────────────
// One row per PROJECT, showing real completion based on its actual tasks —
// not just whatever % a manager may have manually typed on the project
// itself (that manual value is included too, for comparison, in its own
// column). Also includes a full task-detail sheet grouped by project.
//
// SCOPE (current, deliberately simple): always restricted to projects the
// logged-in user personally has at least one task on — regardless of
// permission level. Full company-wide visibility for managers is planned
// as its own separate, permission-aware Agent module later — this report
// does not attempt that yet.
exports.generateProjectProgressReport = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company ? user.company : user._id;

    const myTasks = await TaskSheet.find({ employees: user._id }).select('project').lean();
    const myProjectIds = [...new Set(myTasks.map(t => t.project?.toString()).filter(Boolean))];

    if (myProjectIds.length === 0) {
      return res.status(404).json({ success: false, error: "You have no projects with tasks assigned to you yet" });
    }

    const projectQuery = { company: companyId, _id: { $in: myProjectIds } };

    const projects = await Project.find(projectQuery)
      .populate('custId', 'custName')
      .lean();

    if (projects.length === 0) {
      return res.status(404).json({ success: false, error: "No projects found to report on" });
    }

    const projectIds = projects.map(p => p._id);
    // Task detail below is also scoped to just this user's own tasks within
    // those projects — not every teammate's tasks on the same project.
    const allTasks = await TaskSheet.find({ company: companyId, project: { $in: projectIds }, employees: user._id })
      .populate('taskName', 'name')
      .populate('employees', 'name')
      .lean();

    const tasksByProject = new Map();
    allTasks.forEach(t => {
      const key = t.project?.toString();
      if (!key) return;
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key).push(t);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projectRows = projects.map(project => {
      const tasks = tasksByProject.get(project._id.toString()) || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.taskStatus === 'completed').length;
      const overdueTasks = tasks.filter(t => isOverdue(t)).length;
      const avgTaskCompletion = totalTasks
        ? Math.round(tasks.reduce((sum, t) => sum + (t.taskLevel || 0), 0) / totalTasks)
        : null;

      return {
        projectId: project._id,
        name: project.name || 'Unnamed Project',
        customer: project.custId?.custName || 'N/A',
        projectStatus: project.projectStatus || 'N/A',
        manualCompleteLevel: project.completeLevel ?? 'N/A',
        totalTasks,
        completedTasks,
        overdueTasks,
        avgTaskCompletion,
        startDate: project.startDate,
        endDate: project.endDate,
      };
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProClient360';
    workbook.created = new Date();

    // ── Summary sheet: one row per project ──
    const summarySheet = workbook.addWorksheet('Project Progress');
    summarySheet.columns = [
      { header: 'Project Name', key: 'name', width: 30 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Project Status', key: 'projectStatus', width: 15 },
      { header: 'Manual Completion % (set by Manager)', key: 'manualCompleteLevel', width: 30 },
      { header: 'Total Tasks', key: 'totalTasks', width: 12 },
      { header: 'Completed Tasks', key: 'completedTasks', width: 15 },
      { header: 'Overdue Tasks', key: 'overdueTasks', width: 14 },
      { header: 'Avg Task Completion % (real)', key: 'avgTaskCompletion', width: 24 },
      { header: 'Start Date', key: 'startDate', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
    ];
    summarySheet.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });

    projectRows.forEach(p => {
      const row = summarySheet.addRow({
        name: p.name,
        customer: p.customer,
        projectStatus: p.projectStatus,
        manualCompleteLevel: p.manualCompleteLevel,
        totalTasks: p.totalTasks,
        completedTasks: p.completedTasks,
        overdueTasks: p.overdueTasks,
        avgTaskCompletion: p.avgTaskCompletion === null ? 'No tasks yet' : p.avgTaskCompletion,
        startDate: p.startDate ? new Date(p.startDate).toLocaleDateString() : '',
        endDate: p.endDate ? new Date(p.endDate).toLocaleDateString() : '',
      });
      if (p.overdueTasks > 0) row.getCell('overdueTasks').fill = OVERDUE_FILL;
      if (p.totalTasks > 0 && p.completedTasks === p.totalTasks) {
        row.eachCell(cell => { cell.fill = COMPLETED_FILL; });
      }
    });
    summarySheet.autoFilter = { from: 'A1', to: `J${projectRows.length + 1}` };

    // ── Detail sheet: every task, grouped by project ──
    const detailSheet = workbook.addWorksheet('Task Detail by Project');
    detailSheet.columns = [
      { header: 'Project', key: 'project', width: 28 },
      { header: 'Task Name', key: 'taskName', width: 25 },
      { header: 'Employees', key: 'employees', width: 25 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Completion %', key: 'taskLevel', width: 14 },
      { header: 'End Date', key: 'endDate', width: 14 },
      { header: 'Overdue', key: 'overdue', width: 10 },
    ];
    detailSheet.getRow(1).eachCell(cell => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
    });

    projects.forEach(project => {
      const tasks = (tasksByProject.get(project._id.toString()) || [])
        .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
      tasks.forEach(t => {
        const overdue = isOverdue(t);
        const row = detailSheet.addRow({
          project: project.name || 'Unnamed Project',
          taskName: t.taskName?.name || 'Task',
          employees: (t.employees || []).map(e => e.name).join(', ') || 'N/A',
          status: t.taskStatus,
          taskLevel: t.taskLevel,
          endDate: t.endDate ? new Date(t.endDate).toLocaleDateString() : '',
          overdue: overdue ? 'Yes' : 'No',
        });
        if (overdue) row.eachCell(cell => { cell.fill = OVERDUE_FILL; });
        else if (t.taskStatus === 'completed') row.eachCell(cell => { cell.fill = COMPLETED_FILL; });
      });
    });
    detailSheet.autoFilter = { from: 'A1', to: `G${allTasks.length + 1}` };

    const filename = `Project_Progress_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating project progress report:', error);
    res.status(500).json({ error: 'Error generating report: ' + error.message });
  }
};