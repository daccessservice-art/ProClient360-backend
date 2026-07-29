const axios = require('axios');
const TaskSheet = require('../models/taskSheetModel');
const Employee = require('../models/employeeModel');
const Action = require('../models/actionModel');
const Notification = require('../models/notificationModel');
const AgentAuditLog = require('../models/agentAuditLogModel');
const { admin } = require('../utils/firebase');

// ─────────────────────────────────────────────────────────────────────────
// PROJECT TASK AGENT — SECURITY MODEL
//
//   User (voice/text)
//        ↓
//   Claude API — READ-ONLY access to the user's own task data.
//        Can only call a whitelisted tool; never touches the DB itself.
//        ↓
//   Server-side validation — every value re-checked independently,
//        the model's claims are never trusted.
//        ↓
//   Ownership check — task.employees must include req.user._id.
//        ↓
//   Field whitelist — ONLY remark / taskStatus / taskLevel / startDate /
//        endDate (field_update), or a new Action log entry (action_log).
//        NO delete capability exists anywhere in this module. NO ability
//        to reassign people, change projects, or touch other users' tasks.
//        ↓
//   Human clicks "Apply" — nothing is ever written automatically.
//        ↓
//   Database write — scoped, validated, ownership-checked, and logged to
//        AgentAuditLog for full accountability.
// ─────────────────────────────────────────────────────────────────────────

const OPEN_TASK_STATUSES = ['upcoming', 'inprocess', 'stuck'];
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

const EDITABLE_FIELDS = ['remark', 'taskStatus', 'taskLevel', 'startDate', 'endDate'];
const TASK_STATUS_VALUES = ['stuck', 'inprocess', 'completed', 'upcoming'];
const ACTION_STATUS_VALUES = ['inprocess', 'stuck', 'completed'];

// ─── GET /api/project-task-agent/suggest-assignees ─────────────────────────
exports.suggestAssignees = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company ? user.company : user._id;
    const excludeIds = (req.query.excludeIds || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Never suggest the person doing the assigning to themselves — this
    // endpoint is used for "assign this to someone else," so self-suggestion
    // never makes sense here, regardless of what the frontend passes.
    if (!excludeIds.includes(user._id.toString())) {
      excludeIds.push(user._id.toString());
    }

    const employees = await Employee.find({
      company: companyId,
      _id: { $nin: excludeIds },
    }).select('_id name email').lean();

    if (employees.length === 0) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    const openTasks = await TaskSheet.find({
      company: companyId,
      taskStatus: { $in: OPEN_TASK_STATUSES },
    }).select('employees').lean();

    const loadByEmployee = new Map();
    employees.forEach(e => loadByEmployee.set(e._id.toString(), 0));

    openTasks.forEach(task => {
      (task.employees || []).forEach(empId => {
        const key = empId.toString();
        if (loadByEmployee.has(key)) {
          loadByEmployee.set(key, loadByEmployee.get(key) + 1);
        }
      });
    });

    const suggestions = employees
      .map(e => ({
        employeeId: e._id,
        name: e.name,
        email: e.email,
        currentOpenTasks: loadByEmployee.get(e._id.toString()) || 0,
      }))
      .sort((a, b) => a.currentOpenTasks - b.currentOpenTasks);

    res.status(200).json({
      success: true,
      suggestions,
      recommended: suggestions[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generating assignment suggestions: ' + error.message });
  }
};

// ─── GET /api/project-task-agent/suggest-tester ─────────────────────────────
exports.suggestTester = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company ? user.company : user._id;

    const employees = await Employee.find({ company: companyId }).select('_id name email').lean();
    if (employees.length === 0) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    const openTestItems = await TaskSheet.find({
      company: companyId,
      qaStatus: { $in: ['pending_test', 'testing'] },
      assignedTester: { $ne: null },
    }).select('assignedTester').lean();

    const loadByTester = new Map();
    employees.forEach(e => loadByTester.set(e._id.toString(), 0));

    openTestItems.forEach(task => {
      const key = task.assignedTester?.toString();
      if (key && loadByTester.has(key)) {
        loadByTester.set(key, loadByTester.get(key) + 1);
      }
    });

    const suggestions = employees
      .map(e => ({
        employeeId: e._id,
        name: e.name,
        email: e.email,
        currentTestingQueue: loadByTester.get(e._id.toString()) || 0,
      }))
      .sort((a, b) => a.currentTestingQueue - b.currentTestingQueue);

    res.status(200).json({
      success: true,
      suggestions,
      recommended: suggestions[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generating tester suggestions: ' + error.message });
  }
};

// ─── GET /api/project-task-agent/my-focus ───────────────────────────────────
exports.suggestNextFocus = async (req, res) => {
  try {
    const user = req.user;

    const openTasks = await TaskSheet.find({
      employees: user._id,
      taskStatus: { $in: OPEN_TASK_STATUSES },
    })
      .populate('project', 'name')
      .populate('taskName', 'name')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdueCount = 0;
    let dueTodayCount = 0;

    const ranked = openTasks.map(task => {
      const end = new Date(task.endDate);
      end.setHours(0, 0, 0, 0);
      const daysOverdue = Math.round((today - end) / (1000 * 60 * 60 * 24));

      if (daysOverdue > 0) overdueCount += 1;
      else if (daysOverdue === 0) dueTodayCount += 1;

      return {
        taskId: task._id,
        projectName: task.project?.name || 'Unknown Project',
        taskName: task.taskName?.name || 'Task',
        priority: task.priority || 'medium',
        endDate: task.endDate,
        daysOverdue,
      };
    });

    ranked.sort((a, b) => {
      if (b.daysOverdue !== a.daysOverdue) return b.daysOverdue - a.daysOverdue;
      const pw = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      if (pw !== 0) return pw;
      return new Date(a.endDate) - new Date(b.endDate);
    });

    res.status(200).json({
      success: true,
      summary: { totalOpen: openTasks.length, overdueCount, dueTodayCount },
      recommended: ranked[0] || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error generating focus suggestion: ' + error.message });
  }
};

// ─── Notification helpers ────────────────────────────────────────────────
const sendNotificationToUser = async (userId, message, senderId, currentUserName, currentUserProfilePic) => {
  try {
    if (userId.toString() === senderId.toString()) return;
    const employee = await Employee.findById(userId);
    if (!employee) return;

    const newNotification = new Notification({ message, userIds: userId, sender: senderId });
    await newNotification.save();

    if (employee.fcmToken) {
      const messagePayload = {
        notification: { title: `Task Status Update`, body: message },
        token: employee.fcmToken,
        data: {
          sender: currentUserName,
          profilePic: currentUserProfilePic,
          message,
          time: new Date().toISOString(),
          isSeen: "false",
        },
      };
      try {
        await admin.messaging().send(messagePayload);
      } catch (err) {
        console.error('Error sending FCM notification:', err);
      }
    }
  } catch (error) {
    console.error('Error in sendNotificationToUser:', error);
  }
};

const notifyAssignerOnStatusChange = async (taskStatus, currentStatus, tasksheet, currentUserId) => {
  if ((taskStatus !== 'stuck' && taskStatus !== 'completed') || currentStatus === taskStatus) return;
  try {
    const currentUser = await Employee.findById(currentUserId);
    const statusText = taskStatus === 'completed' ? 'completed' : 'stuck';
    const message = `Task "${tasksheet.taskName.name}" has been marked as ${statusText} by ${currentUser.name}.`;

    if (tasksheet.assignedBy) {
      const assignerId = tasksheet.assignedBy._id ? tasksheet.assignedBy._id.toString() : tasksheet.assignedBy.toString();
      if (assignerId !== currentUserId.toString()) {
        await sendNotificationToUser(assignerId, message, currentUserId, currentUser.name, currentUser.profilePic);
      }
    }
  } catch (error) {
    console.error('Error in notifyAssignerOnStatusChange:', error);
  }
};

// ─── Audit logging helper — failures here NEVER block the actual update.
// Losing an audit entry is bad; losing the user's real work because the
// audit write hiccuped would be worse. ──────────────────────────────────
const logAgentAction = async ({ user, actionType, taskId, details }) => {
  try {
    await AgentAuditLog.create({
      company: user.company ? user.company : user._id,
      performedBy: user._id,
      agentModule: 'projectTaskAgent',
      actionType,
      task: taskId,
      details,
    });
  } catch (error) {
    console.error('Failed to write agent audit log (update itself still succeeded):', error);
  }
};

// ─── Tools given to Claude ───────────────────────────────────────────────
const TOOLS = [
  {
    name: 'propose_task_update',
    description:
      "Propose a single-field change to one of the user's own open tasks (just remark, status, completion %, start date, OR end date — not logging new work). This does NOT save anything. If unsure which task, ask a clarifying question in plain text instead of calling this.",
    input_schema: {
      type: 'object',
      properties: {
        taskDescription: { type: 'string', description: "The task or project name the user mentioned." },
        field: { type: 'string', enum: EDITABLE_FIELDS },
        newValue: { type: 'string', description: "New value. For taskStatus: stuck/inprocess/completed/upcoming. For taskLevel: 0-100. For dates: YYYY-MM-DD." },
      },
      required: ['taskDescription', 'field', 'newValue'],
    },
  },
  {
    name: 'propose_log_work',
    description:
      "Propose logging a NEW work update on one of the user's own open tasks — like using the 'Submit Work' form: describes what was done, sets a new completion percentage, and a status. Use this when the user describes work they did, not just a single field edit. This does NOT save anything.",
    input_schema: {
      type: 'object',
      properties: {
        taskDescription: { type: 'string', description: "The task or project name the user mentioned." },
        action: { type: 'string', description: "Short description of the work done, as the user said it." },
        taskStatus: { type: 'string', enum: ACTION_STATUS_VALUES },
        taskLevel: { type: 'string', description: 'New completion percentage, 0-100, as the user stated (or implied by "completed" = 100).' },
        remark: { type: 'string', description: 'Optional additional remark.' },
      },
      required: ['taskDescription', 'action', 'taskStatus', 'taskLevel'],
    },
  },
];

const findMatchingTask = (openTasks, description) => {
  const needle = (description || '').toLowerCase();
  return openTasks.find(t =>
    (t.taskName?.name || '').toLowerCase().includes(needle) ||
    (t.project?.name || '').toLowerCase().includes(needle) ||
    needle.includes((t.taskName?.name || '').toLowerCase()) ||
    needle.includes((t.project?.name || '').toLowerCase())
  );
};

const validateProposedFieldValue = (field, rawValue) => {
  if (field === 'taskLevel') {
    const num = Number(rawValue);
    if (isNaN(num) || num < 0 || num > 100) return { ok: false, error: 'Task level must be a number between 0 and 100.' };
    return { ok: true, value: num };
  }
  if (field === 'taskStatus') {
    const val = rawValue.toLowerCase().trim();
    if (!TASK_STATUS_VALUES.includes(val)) return { ok: false, error: `Status must be one of: ${TASK_STATUS_VALUES.join(', ')}.` };
    return { ok: true, value: val };
  }
  if (field === 'startDate' || field === 'endDate') {
    const date = new Date(rawValue);
    if (isNaN(date.getTime())) return { ok: false, error: `"${rawValue}" isn't a valid date.` };
    return { ok: true, value: date };
  }
  if (field === 'remark') {
    if (rawValue.length > 2000) return { ok: false, error: 'Remark cannot exceed 2000 characters.' };
    return { ok: true, value: rawValue };
  }
  return { ok: false, error: 'Unsupported field.' };
};

const validateProposedActionLog = (action, taskStatus, taskLevelRaw, remark, currentTaskLevel) => {
  if (!action || !action.trim()) return { ok: false, error: 'A description of the work is required.' };
  if (action.length > 500) return { ok: false, error: 'Work description cannot exceed 500 characters.' };
  if (!ACTION_STATUS_VALUES.includes(taskStatus)) {
    return { ok: false, error: `Status must be one of: ${ACTION_STATUS_VALUES.join(', ')}.` };
  }

  let level = Number(taskLevelRaw);
  if (taskStatus === 'completed') level = 100;
  if (isNaN(level) || level < 0 || level > 100) {
    return { ok: false, error: 'Completion level must be a number between 0 and 100.' };
  }
  if (typeof currentTaskLevel === 'number' && level < currentTaskLevel) {
    return { ok: false, error: `Completion level can't go backward — it's currently ${currentTaskLevel}%.` };
  }
  if (remark && remark.length > 2000) {
    return { ok: false, error: 'Remark cannot exceed 2000 characters.' };
  }
  return { ok: true, action: action.trim(), taskStatus, taskLevel: level, remark: remark || '' };
};

// ─── POST /api/project-task-agent/chat ──────────────────────────────────────
exports.chatWithAgent = async (req, res) => {
  try {
    const user = req.user;
    const { message, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }
    if (message.length > 500) {
      return res.status(400).json({ success: false, error: "Message is too long — please keep it under 500 characters." });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ success: false, error: "AI agent is not configured yet. Add ANTHROPIC_API_KEY to your backend .env file." });
    }

    const openTasks = await TaskSheet.find({
      employees: user._id,
      taskStatus: { $in: OPEN_TASK_STATUSES },
    })
      .populate('project', 'name')
      .populate('taskName', 'name')
      .limit(30)
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskLines = openTasks.map(t => {
      const end = new Date(t.endDate);
      end.setHours(0, 0, 0, 0);
      const daysOverdue = Math.round((today - end) / (1000 * 60 * 60 * 24));
      const overdueNote = daysOverdue > 0 ? `${daysOverdue} day(s) overdue` : daysOverdue === 0 ? 'due today' : 'not yet due';

      const qaNote = t.qaStatus && t.qaStatus !== 'none' ? `, QA: ${t.qaStatus}` : '';
      const cyclesNote = t.testCycles ? `, ${t.testCycles} bug round(s)` : '';
      const remarkNote = t.remark ? `, last remark: "${t.remark.slice(0, 120)}"` : '';

      // Assigned date = when this task record was created (timestamps:true
      // on the schema). This is what lets the Agent actually answer
      // "what was assigned today" instead of falsely claiming it has no
      // access to dates — it always did, it just wasn't being told.
      const assignedNote = t.createdAt ? `, assigned: ${new Date(t.createdAt).toISOString().slice(0, 10)}` : '';

      return `- "${t.taskName?.name || 'Task'}" on project "${t.project?.name || 'Project'}", priority: ${t.priority}, status: ${t.taskStatus}, level: ${t.taskLevel}%, ${overdueNote}${assignedNote}${qaNote}${cyclesNote}${remarkNote}`;
    }).join('\n');

    const todayISO = today.toISOString().slice(0, 10);

    const systemPrompt = `You are the "Work Agent" inside ProClient360. You are speaking with ${user.name || 'an employee'} about their own current tasks.

Today's date is ${todayISO}. You DO have access to the current date and to each task's assigned date (shown below as "assigned: YYYY-MM-DD") — never claim you lack access to dates or a calendar. To answer "what was assigned today", compare each task's assigned date to today's date given above.

Rules:
- Answer using ONLY the task data below. Never invent task names, dates, or numbers.
- Keep replies short: 2-3 sentences, suitable to be read aloud.
- If asked WHY a task is late, stuck, or not completed, reason from the signals actually present in its data — QA status, bug round count, and its last remark are the real evidence. If none of that explains it, say the data doesn't show a clear reason rather than inventing one.
- When it fits naturally, offer one brief, practical suggestion (e.g. "worth pinging QA" or "this one's overdue and low priority — maybe reprioritize it") — but only when grounded in the visible data, not generic advice.
- If the user describes work they DID (e.g. "I finished the API integration, it's 80% done now"), use the propose_log_work tool.
- If the user asks to change ONE specific field without describing new work (e.g. "change the end date to Friday"), use the propose_task_update tool.
- If unsure which task they mean, ask a clarifying question in plain text — do not guess or call a tool.
- You cannot touch other employees' tasks, only ${user.name || 'this user'}'s own tasks listed below.

${user.name || 'This user'}'s current open tasks (${openTasks.length} total):
${taskLines || 'No open tasks right now.'}
`;

    const conversationHistory = Array.isArray(history)
      ? history.filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')).slice(-6)
      : [];

    const anthropicResponse = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        tools: TOOLS,
        messages: [...conversationHistory, { role: 'user', content: message.trim() }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    const content = anthropicResponse.data?.content || [];
    const toolUseBlock = content.find(c => c.type === 'tool_use');
    const textBlock = content.find(c => c.type === 'text');
    const spokenText = textBlock?.text || '';

    if (!toolUseBlock) {
      return res.status(200).json({ success: true, type: 'text', reply: spokenText || "I didn't quite catch that — could you rephrase?" });
    }

    if (toolUseBlock.name === 'propose_task_update') {
      const { taskDescription, field, newValue } = toolUseBlock.input || {};

      if (!EDITABLE_FIELDS.includes(field)) {
        return res.status(200).json({ success: true, type: 'text', reply: "I can only update remark, status, completion level, start date, or end date — not that field." });
      }
      const matchedTask = findMatchingTask(openTasks, taskDescription);
      if (!matchedTask) {
        return res.status(200).json({ success: true, type: 'text', reply: `I couldn't find an open task matching "${taskDescription}". Could you name it more specifically?` });
      }
      const validation = validateProposedFieldValue(field, newValue);
      if (!validation.ok) {
        return res.status(200).json({ success: true, type: 'text', reply: validation.error });
      }

      const currentValue = matchedTask[field];
      return res.status(200).json({
        success: true,
        type: 'proposal',
        reply: spokenText || `Update ${field} for "${matchedTask.taskName?.name}" — confirm below?`,
        proposal: {
          kind: 'field_update',
          taskId: matchedTask._id,
          taskName: matchedTask.taskName?.name || 'Task',
          projectName: matchedTask.project?.name || 'Project',
          field,
          currentValue: currentValue instanceof Date ? currentValue.toISOString().slice(0, 10) : currentValue,
          newValue: validation.value instanceof Date ? validation.value.toISOString().slice(0, 10) : validation.value,
        },
      });
    }

    if (toolUseBlock.name === 'propose_log_work') {
      const { taskDescription, action, taskStatus, taskLevel, remark } = toolUseBlock.input || {};

      const matchedTask = findMatchingTask(openTasks, taskDescription);
      if (!matchedTask) {
        return res.status(200).json({ success: true, type: 'text', reply: `I couldn't find an open task matching "${taskDescription}". Could you name it more specifically?` });
      }

      const validation = validateProposedActionLog(action, taskStatus, taskLevel, remark, matchedTask.taskLevel);
      if (!validation.ok) {
        return res.status(200).json({ success: true, type: 'text', reply: validation.error });
      }

      return res.status(200).json({
        success: true,
        type: 'proposal',
        reply: spokenText || `Log this work on "${matchedTask.taskName?.name}" — confirm below?`,
        proposal: {
          kind: 'action_log',
          taskId: matchedTask._id,
          taskName: matchedTask.taskName?.name || 'Task',
          projectName: matchedTask.project?.name || 'Project',
          action: validation.action,
          taskStatus: validation.taskStatus,
          taskLevel: validation.taskLevel,
          remark: validation.remark,
          currentTaskLevel: matchedTask.taskLevel,
        },
      });
    }

    return res.status(200).json({ success: true, type: 'text', reply: spokenText || "I couldn't process that request." });
  } catch (error) {
    console.error('Agent chat error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: "The AI agent had trouble responding. Please try again." });
  }
};

// ─── PUT /api/project-task-agent/apply-update ───────────────────────────────
exports.applyAgentUpdate = async (req, res) => {
  try {
    const user = req.user;
    const { taskId, field, newValue } = req.body;

    if (!taskId || !field || newValue === undefined || newValue === null) {
      return res.status(400).json({ success: false, error: "taskId, field, and newValue are required" });
    }
    if (!EDITABLE_FIELDS.includes(field)) {
      return res.status(400).json({ success: false, error: "That field cannot be updated this way" });
    }

    const task = await TaskSheet.findById(taskId);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });
    if (!task.employees.some(empId => empId.toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: "You can only update your own tasks" });
    }

    const validation = validateProposedFieldValue(field, String(newValue));
    if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

    const previousValue = task[field];
    task[field] = validation.value;
    await task.save();

    // ✅ Audit trail — recorded after the write succeeds, never blocks it
    await logAgentAction({
      user,
      actionType: 'field_update',
      taskId: task._id,
      details: {
        field,
        previousValue: previousValue instanceof Date ? previousValue.toISOString() : previousValue,
        newValue: validation.value instanceof Date ? validation.value.toISOString() : validation.value,
      },
    });

    res.status(200).json({ success: true, message: `Updated ${field} successfully`, data: { taskId: task._id, field, newValue: validation.value } });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }
    res.status(500).json({ success: false, error: "Error applying update: " + error.message });
  }
};

// ─── PUT /api/project-task-agent/apply-action-log ───────────────────────────
exports.applyAgentActionLog = async (req, res) => {
  try {
    const user = req.user;
    const { taskId, action, taskStatus, taskLevel, remark } = req.body;

    if (!taskId || !action || !taskStatus || taskLevel === undefined) {
      return res.status(400).json({ success: false, error: "taskId, action, taskStatus, and taskLevel are required" });
    }

    const tasksheet = await TaskSheet.findById(taskId)
      .populate('taskName')
      .populate('employees')
      .populate({ path: 'assignedBy', strictPopulate: false })
      .populate({ path: 'createdBy', strictPopulate: false });

    if (!tasksheet) return res.status(404).json({ success: false, error: "Task not found" });
    if (!tasksheet.employees.some(emp => (emp._id || emp).toString() === user._id.toString())) {
      return res.status(403).json({ success: false, error: "You can only log work on your own tasks" });
    }

    const validation = validateProposedActionLog(action, taskStatus, taskLevel, remark, tasksheet.taskLevel);
    if (!validation.ok) return res.status(400).json({ success: false, error: validation.error });

    const currentStatus = tasksheet.taskStatus;
    const previousLevel = tasksheet.taskLevel;
    const now = new Date();

    const newAction = new Action({
      task: taskId,
      action: validation.action,
      actionBy: user._id,
      startTime: now,
      endTime: now,
      complated: validation.taskLevel,
      taskStatus: validation.taskStatus,
      remark: validation.remark,
    });
    await newAction.save();

    if (validation.taskStatus === 'completed') {
      tasksheet.taskStatus = 'completed';
      tasksheet.taskLevel = 100;
      if (!tasksheet.actualEndDate) tasksheet.actualEndDate = now;
    } else {
      tasksheet.taskLevel = validation.taskLevel;
      tasksheet.taskStatus = validation.taskStatus;
    }
    await tasksheet.save({ validateBeforeSave: false });

    await notifyAssignerOnStatusChange(validation.taskStatus, currentStatus, tasksheet, user._id);

    // ✅ Audit trail
    await logAgentAction({
      user,
      actionType: 'action_log',
      taskId,
      details: {
        actionText: validation.action,
        previousStatus: currentStatus,
        newStatus: validation.taskStatus,
        previousLevel,
        newLevel: validation.taskLevel,
        remark: validation.remark,
        actionDocId: newAction._id,
      },
    });

    res.status(200).json({
      success: true,
      message: "Work logged successfully",
      data: { taskId, taskStatus: validation.taskStatus, taskLevel: validation.taskLevel },
    });
  } catch (error) {
    console.error("Error applying agent action log:", error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: errors.join(', ') });
    }
    res.status(500).json({ success: false, error: "Error logging work: " + error.message });
  }
};

// ─── NEW: GET /api/project-task-agent/audit-log ─────────────────────────────
// Manager-facing view of everything the Agent has ever changed. A regular
// employee only sees changes made under THEIR OWN account; someone with
// 'viewTaskSheet' permission (or the company account) sees the whole
// company's Agent activity.
exports.getAgentAuditLog = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const query = {};
    const companyId = user.company ? user.company : user._id;
    query.company = companyId;

    if (user.company) {
      try {
        const employeeDoc = await Employee.findById(user._id).populate('designation');
        const hasPermission = employeeDoc?.designation?.permissions?.includes('viewTaskSheet');
        if (!hasPermission) {
          query.performedBy = user._id; // only their own Agent-applied changes
        }
      } catch (err) {
        query.performedBy = user._id;
      }
    }

    const logs = await AgentAuditLog.find(query)
      .populate('performedBy', 'name')
      .populate('task', 'taskName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error fetching agent audit log: ' + error.message });
  }
};