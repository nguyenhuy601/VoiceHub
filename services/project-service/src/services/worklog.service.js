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
} = require('../utils/task/timeTracking');
const { isTaskAssignee } = require('../utils/task/taskAssignee');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { logActivity } = require('./project.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const { emitWorklogFactBestEffort } = require('../clients/analyticsPublisher.client');

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
 * Collapse legacy duplicate rows for (taskId, userId, workDate) before unique upsert.
 * Keeps the newest document.
 */
async function collapseDuplicateWorklogs({ taskId, userId, workDate }) {
  const rows = await Worklog.find({ taskId, userId, workDate })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  if (rows.length <= 1) return rows[0] || null;
  const keep = rows[0];
  const dropIds = rows.slice(1).map((r) => r._id);
  await Worklog.deleteMany({ _id: { $in: dropIds } });
  return keep;
}

/**
 * Assignee self-log: upsert one Worklog per (taskId, actor, workDate).
 * Ignores proxy userId — always logs for the actor.
 * @returns {Promise<{ worklog: object, created: boolean }>}
 */
async function createWorklog({ taskId, actorUserId, workDate, hours, note } = {}) {
  assertTimeTrackingEnabled();
  const task = await loadTaskOrThrow(taskId);
  if (task.projectId) {
    const Project = require('../models/Project');
    const project = await Project.findById(task.projectId).select('status').lean();
    if (project) assertProjectWritable(project);
  }
  await assertTaskPermission({
    task,
    actorUserId,
    permission: 'task:update',
    message: 'Không có quyền log work (task:update)',
  });

  const actorOid = asOid(actorUserId);
  if (!actorOid) {
    const err = new Error('userId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  if (!isTaskAssignee(task, actorOid)) {
    const err = new Error('Chỉ người được gán công việc mới được ghi log giờ');
    err.statusCode = 403;
    err.errorCode = 'WORKLOG_ASSIGNEE_ONLY';
    throw err;
  }

  const workDateNorm = normalizeWorkDate(workDate);
  const hoursNorm = normalizeWorklogHours(hours);
  const noteNorm = String(note || '').trim().slice(0, 2000);

  const prev = await collapseDuplicateWorklogs({
    taskId: task._id,
    userId: actorOid,
    workDate: workDateNorm,
  });

  const doc = await Worklog.findOneAndUpdate(
    { taskId: task._id, userId: actorOid, workDate: workDateNorm },
    {
      $set: {
        organizationId: task.organizationId,
        projectId: task.projectId,
        boardId: task.boardId || null,
        sprintId: task.sprintId || null,
        hours: hoursNorm,
        note: noteNorm,
      },
      $setOnInsert: {
        createdBy: actorOid,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const created = !prev;
  const plain = doc.toObject ? doc.toObject() : doc;

  await logActivity({
    organizationId: task.organizationId,
    projectId: task.projectId,
    boardId: task.boardId || null,
    taskId: task._id,
    actorId: actorUserId,
    type: created ? 'worklog_added' : 'worklog_updated',
    title: created ? `Log ${plain.hours}h` : `Cập nhật log ${plain.hours}h`,
    payload: {
      worklogId: String(plain._id),
      hours: plain.hours,
      workDate: plain.workDate,
      userId: String(plain.userId),
      updated: !created,
    },
  });

  emitWorklogFactBestEffort({
    worklogId: plain._id,
    organizationId: task.organizationId,
    projectId: task.projectId,
    taskId: task._id,
    userId: plain.userId,
    hours: plain.hours,
    workDate: plain.workDate,
    sprintId: plain.sprintId || task.sprintId,
  });

  return { worklog: plain, created };
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

  const estimateSum =
    Math.round(
      byTask.reduce((s, r) => s + (r.estimateHours == null ? 0 : Number(r.estimateHours)), 0) * 100
    ) / 100;
  const actualSum =
    Math.round(byTask.reduce((s, r) => s + (Number(r.actualHours) || 0), 0) * 100) / 100;

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
  isTaskAssignee,
};
