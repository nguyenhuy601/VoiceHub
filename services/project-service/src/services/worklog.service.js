const mongoose = require('../db');
const Task = require('../models/Task');
const Worklog = require('../models/Worklog');
const Sprint = require('../models/Sprint');
const {
  assertTimeTrackingEnabled,
  normalizeWorklogHours,
  normalizeWorkDate,
  varianceHours,
  sumWorklogHours,
} = require('../utils/timeTracking');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { logActivity } = require('./project.service');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

async function loadTaskOrThrow(taskId) {
  const id = asOid(taskId);
  if (!id) {
    const err = new Error('taskId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const task = await Task.findById(id).lean();
  if (!task || task.isActive === false) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return task;
}

async function assertTaskPermission({ task, actorUserId, permission, message }) {
  const projectId = task.projectId ? String(task.projectId) : '';
  if (!projectId) {
    const err = new Error(message || 'Task chưa gắn project — không thể thao tác time tracking');
    err.statusCode = 403;
    throw err;
  }
  await assertUserProjectPermission({
    userId: actorUserId,
    projectId,
    boardId: task.boardId || undefined,
    permission,
    message: message || `Thiếu quyền ${permission}`,
  });
}

/**
 * Sum hours from worklog rows — re-export for callers.
 */

async function createWorklog({
  taskId,
  actorUserId,
  userId,
  workDate,
  hours,
  note,
} = {}) {
  assertTimeTrackingEnabled();
  const task = await loadTaskOrThrow(taskId);
  await assertTaskPermission({
    task,
    actorUserId,
    permission: 'task:update',
    message: 'Không có quyền log work (task:update)',
  });

  const targetUserId = asOid(userId) || String(actorUserId);
  if (!asOid(targetUserId)) {
    const err = new Error('userId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const doc = await Worklog.create({
    organizationId: task.organizationId,
    projectId: task.projectId,
    taskId: task._id,
    boardId: task.boardId || null,
    sprintId: task.sprintId || null,
    userId: targetUserId,
    workDate: normalizeWorkDate(workDate),
    hours: normalizeWorklogHours(hours),
    note: String(note || '').trim().slice(0, 2000),
    createdBy: actorUserId,
  });

  await logActivity({
    organizationId: task.organizationId,
    projectId: task.projectId,
    boardId: task.boardId || null,
    taskId: task._id,
    actorId: actorUserId,
    type: 'worklog_added',
    title: `Log ${doc.hours}h`,
    payload: {
      worklogId: String(doc._id),
      hours: doc.hours,
      workDate: doc.workDate,
      userId: String(doc.userId),
    },
  });

  return doc.toObject ? doc.toObject() : doc;
}

async function listWorklogsForTask({ taskId, actorUserId } = {}) {
  assertTimeTrackingEnabled();
  const task = await loadTaskOrThrow(taskId);
  await assertTaskPermission({
    task,
    actorUserId,
    permission: 'task:view',
    message: 'Không có quyền xem worklog (task:view)',
  });

  const items = await Worklog.find({ taskId: task._id })
    .sort({ workDate: -1, createdAt: -1 })
    .lean();
  const actualHours = sumWorklogHours(items);
  return {
    taskId: String(task._id),
    ...varianceHours(task.estimateHours, actualHours),
    items,
  };
}

async function getSprintTimeSummary({ projectId, sprintId, actorUserId } = {}) {
  assertTimeTrackingEnabled();
  const pid = asOid(projectId);
  const sid = asOid(sprintId);
  if (!pid || !sid) {
    const err = new Error('projectId và sprintId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  await assertUserProjectPermission({
    userId: actorUserId,
    projectId: pid,
    permission: 'sprint:view',
    message: 'Không có quyền xem sprint time summary (sprint:view)',
  });

  const sprint = await Sprint.findOne({ _id: sid, projectId: pid }).lean();
  if (!sprint) {
    const err = new Error('Sprint không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const tasks = await Task.find({
    projectId: pid,
    sprintId: sid,
    isActive: { $ne: false },
  })
    .select('_id title estimateHours status')
    .lean();

  const taskIds = tasks.map((t) => t._id);
  const logs = taskIds.length
    ? await Worklog.find({ taskId: { $in: taskIds } }).select('taskId hours').lean()
    : [];

  const actualByTask = new Map();
  for (const row of logs) {
    const tid = String(row.taskId);
    actualByTask.set(tid, (actualByTask.get(tid) || 0) + (Number(row.hours) || 0));
  }

  const byTask = tasks.map((t) => {
    const tid = String(t._id);
    const actual = Math.round((actualByTask.get(tid) || 0) * 100) / 100;
    return {
      taskId: tid,
      title: t.title || '',
      status: t.status || '',
      ...varianceHours(t.estimateHours, actual),
    };
  });

  const estimateSum = Math.round(
    byTask.reduce((s, r) => s + (r.estimateHours == null ? 0 : Number(r.estimateHours)), 0) * 100
  ) / 100;
  const actualSum = Math.round(byTask.reduce((s, r) => s + (Number(r.actualHours) || 0), 0) * 100) / 100;

  return {
    projectId: pid,
    sprintId: sid,
    sprintName: sprint.name || '',
    estimateSum,
    actualSum,
    varianceHours: Math.round((actualSum - estimateSum) * 100) / 100,
    byTask,
  };
}

module.exports = {
  createWorklog,
  listWorklogsForTask,
  getSprintTimeSummary,
  sumWorklogHours,
  varianceHours,
};
