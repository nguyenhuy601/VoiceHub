const mongoose = require('../db');
const Task = require('../models/Task');
const PlanningItem = require('../models/PlanningItem');
const TaskActivityLog = require('../models/TaskActivityLog');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { logger } = require('@enterprise/shared');
const { serializeHistoryValue, expandLegacyUpdated } = require('../utils/workHistoryDiff');

const HISTORY_SELECT = 'actorId type title payload createdAt';
const TASK_META_SELECT = '_id projectId boardId isActive organizationId';

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function clampLimit(limit) {
  return Math.min(Math.max(Number(limit) || 50, 1), 200);
}

function parseBefore(before) {
  if (!before) return null;
  const d = new Date(before);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Append-only field history. Best-effort — không rollback mutation.
 */
async function appendFieldChanges({
  organizationId,
  projectId,
  boardId = null,
  taskId = null,
  planningItemId = null,
  actorId,
  changes = [],
} = {}) {
  try {
    const orgOid = asOid(organizationId);
    const projectOid = asOid(projectId);
    const actorOid = asOid(actorId);
    if (!orgOid || !projectOid || !actorOid) return;
    const rows = (Array.isArray(changes) ? changes : [])
      .filter((ch) => ch && ch.field)
      .map((ch) => ({
        organizationId: orgOid,
        projectId: projectOid,
        boardId: asOid(boardId) || null,
        taskId: asOid(taskId) || null,
        planningItemId: asOid(planningItemId) || null,
        actorId: actorOid,
        type: 'work.field_changed',
        title: String(ch.field).slice(0, 500),
        payload: {
          field: String(ch.field).slice(0, 64),
          from: serializeHistoryValue(ch.from),
          to: serializeHistoryValue(ch.to),
        },
      }))
      .filter((row) => {
        try {
          return JSON.stringify(row.payload.from) !== JSON.stringify(row.payload.to);
        } catch {
          return true;
        }
      });
    if (!rows.length) return;
    await TaskActivityLog.insertMany(rows);
  } catch (err) {
    logger.warn('[workHistory] append failed: %s', err.message);
  }
}

async function listTaskHistory({ taskId, actorUserId, limit, before } = {}) {
  const id = asOid(taskId);
  if (!id) {
    const err = new Error('taskId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const task = await Task.findById(id).select(TASK_META_SELECT).lean();
  if (!task || task.isActive === false) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const projectId = task.projectId ? String(task.projectId) : '';
  if (!projectId) {
    const err = new Error('Task chưa gắn project');
    err.statusCode = 403;
    throw err;
  }
  await assertUserProjectPermission({
    userId: actorUserId,
    projectId,
    boardId: task.boardId || undefined,
    permission: 'task:view',
    message: 'Không có quyền xem lịch sử (task:view)',
  });

  const q = { taskId: task._id };
  const cursor = parseBefore(before);
  if (cursor) q.createdAt = { $lt: cursor };
  const docs = await TaskActivityLog.find(q)
    .select(HISTORY_SELECT)
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit))
    .lean();
  return { items: docs.flatMap(expandLegacyUpdated) };
}

async function listPlanningItemHistory({ projectId, itemId, actorUserId, limit, before } = {}) {
  const pid = asOid(projectId);
  const iid = asOid(itemId);
  if (!pid || !iid) {
    const err = new Error('projectId/itemId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const projectService = require('./project.service');
  await projectService.getProject({ userId: actorUserId, projectId: pid });
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    await assertUserProjectPermission({
      userId: actorUserId,
      projectId: pid,
      permission: 'backlog:view',
      message: 'Không có quyền xem lịch sử planning (backlog:view)',
    });
  }
  const item = await PlanningItem.findOne({ _id: iid, projectId: pid, isActive: true })
    .select('_id projectId')
    .lean();
  if (!item) {
    const err = new Error('Planning item không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const q = { planningItemId: item._id, projectId: item.projectId };
  const cursor = parseBefore(before);
  if (cursor) q.createdAt = { $lt: cursor };
  const docs = await TaskActivityLog.find(q)
    .select(HISTORY_SELECT)
    .sort({ createdAt: -1 })
    .limit(clampLimit(limit))
    .lean();
  return { items: docs.flatMap(expandLegacyUpdated) };
}

module.exports = {
  appendFieldChanges,
  listTaskHistory,
  listPlanningItemHistory,
};
