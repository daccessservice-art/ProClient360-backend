const mongoose = require('mongoose');
const TaskSheet = require('../models/taskSheetModel');
const Action = require('../models/actionModel');
const { buildEmployeeProgressMap } = require('./taskProgressHelper');

const idOf = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : '');

// ONE employee's own completion % on a (possibly shared) task
// postBugLevel = this employee's latest logged level AFTER the last bug report (if any)
const getMyLevel = (task, userId, taskProgress = {}, postBugLevel) => {
  if (task.qaStatus === 'passed') return 100; // tester passed -> everyone done

  const own = Number(taskProgress[userId] || 0);
  const count = Array.isArray(task.employees) ? task.employees.length : 0;
  const base = count <= 1 ? Math.max(own, task.taskLevel || 0) : own;

  // Bug found -> task is back with the developer(s):
  // capped at 90 until they log NEW work after the bug report
  if (task.qaStatus === 'bug_found') {
    if (postBugLevel !== undefined) return Math.min(100, postBugLevel);
    return Math.min(base, 90);
  }

  return base; // single employee -> shared level is theirs; many -> only own work counts
};

const getMyStatus = (task, myLevel) => {
  if (myLevel >= 100) return 'completed';
  const count = Array.isArray(task.employees) ? task.employees.length : 0;
  if (count <= 1) return task.taskStatus === 'completed' ? 'inprocess' : task.taskStatus;
  return myLevel > 0 ? 'inprocess' : 'upcoming';
};

// time of the last bug report (uses ObjectId time, so it needs no createdAt field on Action)
const lastBugTime = (task) => {
  const hist = Array.isArray(task.bugHistory) ? task.bugHistory : [];
  const last = hist.length ? hist[hist.length - 1] : null;
  return (last && last.reportedAt) || task.testEndDate || null;
};

// Returns plain objects where taskLevel / taskStatus are THIS user's own values.
// Shared values are kept as overallTaskLevel / overallTaskStatus.
const applyMyProgress = async (tasks, userId) => {
  const uid = idOf(userId);
  const plain = (tasks || []).map(t => (t && typeof t.toObject === 'function' ? t.toObject() : t));
  const map = await buildEmployeeProgressMap(plain.map(t => t._id));

  // my latest level logged AFTER the last bug report (only for bug_found tasks)
  const postBugMap = {};
  for (const t of plain) {
    if (t.qaStatus !== 'bug_found') continue;
    const since = lastBugTime(t);
    if (!since) continue;
    try {
      const sinceId = mongoose.Types.ObjectId.createFromTime(Math.floor(new Date(since).getTime() / 1000));
      const last = await Action.findOne({ task: t._id, actionBy: uid, _id: { $gt: sinceId } })
        .sort({ _id: -1 })
        .select('complated')
        .lean();
      if (last) postBugMap[idOf(t._id)] = Number(last.complated) || 0;
    } catch (e) {
      console.error('applyMyProgress post-bug lookup failed:', e.message);
    }
  }

  return plain.map(t => {
    const tid = idOf(t._id);
    const myLevel = getMyLevel(t, uid, map[tid] || {}, postBugMap[tid]);
    return {
      ...t,
      overallTaskLevel: t.taskLevel,
      overallTaskStatus: t.taskStatus,
      taskLevel: myLevel,
      taskStatus: getMyStatus(t, myLevel),
    };
  });
};

// Shared task level/status for MULTI-employee tasks:
// completed only when EVERY employee reached 100%.
const syncSharedTaskProgress = async (taskId) => {
  const task = await TaskSheet.findById(taskId);
  if (!task) return;
  const emps = (task.employees || []).map(idOf);
  if (emps.length <= 1) return;
  if (['pending_test', 'testing', 'bug_found', 'passed'].includes(task.qaStatus)) return; // QA flow owns these

  const map = await buildEmployeeProgressMap([task._id]);
  const tp = map[idOf(task._id)] || {};
  const levels = emps.map(e => Number(tp[e] || 0));
  const allDone = levels.every(l => l >= 100);
  const avg = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);

  if (allDone) {
    task.taskLevel = 100;
    task.taskStatus = 'completed';
    if (!task.actualEndDate) task.actualEndDate = new Date();
  } else {
    task.taskLevel = Math.min(avg, 99);
    if (task.taskStatus === 'completed') task.taskStatus = 'inprocess';
    else if (avg > 0 && task.taskStatus === 'upcoming') task.taskStatus = 'inprocess';
  }
  await task.save({ validateBeforeSave: false });
};

module.exports = { applyMyProgress, syncSharedTaskProgress, getMyLevel, getMyStatus };