const Action = require('../models/actionModel');

// ─── Per-employee progress on a (possibly shared) task ───────────────────────
// Returns: { [taskId]: { [employeeId]: level } }
const buildEmployeeProgressMap = async (taskIds) => {
  if (!taskIds || taskIds.length === 0) return {};

  const rows = await Action.aggregate([
    { $match: { task: { $in: taskIds } } },
    {
      $group: {
        _id: { task: '$task', actionBy: '$actionBy' },
        level: {
          $max: {
            $convert: { input: '$complated', to: 'double', onError: 0, onNull: 0 }
          }
        }
      }
    }
  ]);

  const map = {};
  rows.forEach(r => {
    if (!r._id?.task || !r._id?.actionBy) return;
    const taskKey = r._id.task.toString();
    const empKey = r._id.actionBy.toString();
    if (!map[taskKey]) map[taskKey] = {};
    map[taskKey][empKey] = Math.min(100, r.level || 0);
  });
  return map;
};

// YYYY-MM-DD in IST (so "today" is the same no matter where the server runs)
const toISTDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// Days between two YYYY-MM-DD strings (positive = overdue)
const dayDiff = (todayStr, dueStr) =>
  Math.round((Date.parse(todayStr) - Date.parse(dueStr)) / 864e5);

// ─── Project is finished → none of its tasks should blink / count overdue ────
// Works only when task.project is POPULATED with
// projectStatus / actualCompletionDate / completeLevel
const isProjectClosed = (project) => {
  if (!project || typeof project !== 'object') return false;
  const status = (project.projectStatus || '').toLowerCase();
  return (
    status === 'completed' ||
    !!project.actualCompletionDate ||
    Number(project.completeLevel) >= 100
  );
};

// ─── This employee's own level on this task ──────────────────────────────────
const getEmployeeTaskLevel = (task, empId, progressMap) => {
  // Tester passed → done for everyone
  if (task.qaStatus === 'passed') return 100;
  // Submitted for testing → developer's part is done, now waiting on tester
  if (task.qaStatus === 'pending_test' || task.qaStatus === 'testing') return 100;

  const taskProgress = progressMap[task._id.toString()] || {};
  const own = Number(taskProgress[empId] || 0);
  const count = Array.isArray(task.employees) ? task.employees.length : 0;
  const closedByStatus = task.taskStatus === 'completed' || Number(task.taskLevel) >= 100;

  // Single employee → the task level is theirs
  if (count <= 1) return closedByStatus ? 100 : Math.max(own, task.taskLevel || 0);

  // Shared task closed directly (nobody logged any work) → done for everyone
  if (closedByStatus && Object.keys(taskProgress).length === 0) return 100;

  // Shared task → only my own logged work counts
  return own;
};

// ─── Single source of truth: is this task still OPEN for this employee? ──────
const isTaskOpenForEmployee = (task, empId, progressMap) => {
  if (isProjectClosed(task.project)) return false;
  return getEmployeeTaskLevel(task, empId, progressMap) < 100;
};

module.exports = {
  buildEmployeeProgressMap,
  toISTDay,
  dayDiff,
  isProjectClosed,
  getEmployeeTaskLevel,
  isTaskOpenForEmployee,
};