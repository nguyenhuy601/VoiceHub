const mongoose = require('../db');
const Task = require('../models/Task');
const PlanningItem = require('../models/PlanningItem');
const TaskActivityLog = require('../models/TaskActivityLog');
const Project = require('../models/Project');
const TaskBoardList = require('../models/TaskBoardList');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { logger } = require('@enterprise/shared');
const { serializeHistoryValue, expandLegacyUpdated } = require('../utils/workHistoryDiff');
const { displayIssueKey } = require('../utils/displayIssueKey');
const { enrichAssignableProfiles } = require('../utils/userProfileLabels');
const {
  selectAnnouncementChanges,
} = require('@enterprise/shared/messaging/projectWorkActivity');

const HISTORY_SELECT = 'actorId type title payload createdAt';
const TASK_META_SELECT = '_id projectId boardId isActive organizationId title';

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

function isAnnouncementPublishEnabled() {
  const raw = String(process.env.PROJECT_ANNOUNCEMENT_ACTIVITY_PUBLISH ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

const STATUS_LABELS = {
  todo: 'To Do',
  to_do: 'To Do',
  backlog: 'Backlog',
  in_progress: 'In Progress',
  inprogress: 'In Progress',
  doing: 'In Progress',
  done: 'Done',
  completed: 'Done',
  blocked: 'Blocked',
  review: 'Review',
};

/**
 * Humanize history payload for announcement text / history labels
 * (assigneeId → displayName, listId → list title, status → list title / label).
 * @param {object} [caches] optional maps to avoid N+1 when enriching a page
 */
async function resolveAnnouncementValue(field, value, { boardId, caches } = {}) {
  if (value == null || value === '') return value;
  const f = String(field || '');
  const raw = String(value).trim();
  if (f === 'assigneeId' || f === 'assignments') {
    if (Array.isArray(value)) {
      const parts = [];
      for (const v of value) {
        const label = await resolveAnnouncementValue('assigneeId', v, { boardId, caches });
        if (label != null && label !== '') parts.push(String(label));
      }
      return parts.length ? parts.join(', ') : value;
    }
    const uid = asOid(raw);
    if (!uid) return value;
    if (caches?.assigneeById?.has(uid)) {
      return caches.assigneeById.get(uid) || uid;
    }
    try {
      const rows = await enrichAssignableProfiles([uid]);
      const name = rows?.[0]?.displayName;
      return name ? String(name) : uid;
    } catch {
      return uid;
    }
  }
  if (f === 'listId') {
    const listOid = asOid(raw);
    if (!listOid) return value;
    if (caches?.listById?.has(listOid)) {
      return caches.listById.get(listOid) || listOid;
    }
    try {
      const list = await TaskBoardList.findById(listOid).select('title statusKey name').lean();
      const title = String(list?.title || list?.name || list?.statusKey || '').trim();
      return title || listOid;
    } catch {
      return listOid;
    }
  }
  if (f === 'status') {
    const boardOid = asOid(boardId);
    const key = raw.toLowerCase();
    if (caches?.statusByKey?.has(key)) {
      return caches.statusByKey.get(key) || raw;
    }
    if (boardOid && raw) {
      try {
        const list = await TaskBoardList.findOne({
          boardId: boardOid,
          statusKey: raw,
          isArchived: { $ne: true },
        })
          .select('title name statusKey')
          .lean();
        const title = String(list?.title || list?.name || '').trim();
        if (title) return title;
      } catch {
        /* fall through */
      }
    }
    const mapped = STATUS_LABELS[key];
    return mapped || raw;
  }
  return value;
}

/**
 * Additive fromLabel/toLabel on history DTO (backward-compatible).
 */
async function enrichHistoryItemsWithLabels(items, { boardId } = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return rows;

  const assigneeIds = new Set();
  const listIds = new Set();
  for (const row of rows) {
    const field = String(row?.field || '');
    const collect = (v) => {
      if (v == null || v === '') return;
      if (Array.isArray(v)) {
        v.forEach(collect);
        return;
      }
      const oid = asOid(v);
      if (!oid) return;
      if (field === 'assigneeId' || field === 'assignments') assigneeIds.add(oid);
      if (field === 'listId') listIds.add(oid);
    };
    collect(row.from);
    collect(row.to);
  }

  const assigneeById = new Map();
  if (assigneeIds.size) {
    try {
      const profiles = await enrichAssignableProfiles([...assigneeIds]);
      for (const p of profiles || []) {
        const id = asOid(p?.userId || p?._id || p?.id);
        if (id) assigneeById.set(id, String(p.displayName || p.username || '').trim() || id);
      }
    } catch (err) {
      logger.warn('[workHistory] enrich assignees failed: %s', err.message);
    }
  }

  const listById = new Map();
  const statusByKey = new Map();
  const boardOid = asOid(boardId);
  if (listIds.size) {
    try {
      const lists = await TaskBoardList.find({ _id: { $in: [...listIds] } })
        .select('title name statusKey')
        .lean();
      for (const list of lists || []) {
        const id = list?._id ? String(list._id) : '';
        if (!id) continue;
        listById.set(id, String(list.title || list.name || list.statusKey || '').trim() || id);
      }
    } catch (err) {
      logger.warn('[workHistory] enrich lists failed: %s', err.message);
    }
  }
  if (boardOid) {
    try {
      const boardLists = await TaskBoardList.find({
        boardId: boardOid,
        isArchived: { $ne: true },
      })
        .select('title name statusKey')
        .lean();
      for (const list of boardLists || []) {
        const key = String(list.statusKey || '').trim().toLowerCase();
        if (!key) continue;
        const title = String(list.title || list.name || '').trim();
        if (title) statusByKey.set(key, title);
      }
    } catch (err) {
      logger.warn('[workHistory] enrich board status labels failed: %s', err.message);
    }
  }

  const caches = { assigneeById, listById, statusByKey };
  const out = [];
  for (const row of rows) {
    const field = String(row?.field || '');
    const [fromLabel, toLabel] = await Promise.all([
      resolveAnnouncementValue(field, row.from, { boardId, caches }),
      resolveAnnouncementValue(field, row.to, { boardId, caches }),
    ]);
    out.push({
      ...row,
      fromLabel: fromLabel == null ? null : fromLabel,
      toLabel: toLabel == null ? null : toLabel,
    });
  }
  return out;
}

/**
 * After significant field history rows — emit work.activity for #announcement (best-effort).
 */
async function publishAnnouncementFromHistoryRows({
  organizationId,
  projectId,
  boardId,
  taskId,
  actorId,
  insertedDocs = [],
} = {}) {
  if (!isAnnouncementPublishEnabled()) return;
  if (!taskId || !insertedDocs.length) return;
  try {
    const { emitWorkActivityBestEffort } = require('../clients/projectChatPublisher.client');
    const [task, project] = await Promise.all([
      Task.findById(taskId).select('title').lean(),
      Project.findById(projectId).select('projectCode').lean(),
    ]);
    const label = displayIssueKey(project?.projectCode, taskId);
    const taskTitle = String(task?.title || '').trim();
    for (const doc of insertedDocs) {
      const field = String(doc?.payload?.field || '').trim();
      if (!field) continue;
      const [fromLabel, toLabel] = await Promise.all([
        resolveAnnouncementValue(field, doc.payload?.from, { boardId }),
        resolveAnnouncementValue(field, doc.payload?.to, { boardId }),
      ]);
      emitWorkActivityBestEffort({
        organizationId,
        projectId,
        boardId,
        taskId,
        actorId,
        activityLogId: doc._id ? String(doc._id) : undefined,
        field,
        from: fromLabel,
        to: toLabel,
        label,
        taskTitle,
      });
    }
  } catch (err) {
    logger.warn('[workHistory] announcement publish failed: %s', err.message);
  }
}

/**
 * Append-only field history. Best-effort — không rollback mutation.
 */
async function resolveWorkHistoryTitle({ taskId = null, planningItemId = null } = {}) {
  const tid = asOid(taskId);
  if (tid) {
    const task = await Task.findById(tid).select('title').lean();
    return String(task?.title || '').trim().slice(0, 500);
  }
  const pid = asOid(planningItemId);
  if (pid) {
    const item = await PlanningItem.findById(pid).select('title').lean();
    return String(item?.title || '').trim().slice(0, 500);
  }
  return '';
}

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
    // Overview/Activity dùng log.title làm tên work item — không ghi field key (status/listId).
    const workTitle = await resolveWorkHistoryTitle({ taskId, planningItemId });
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
        title: workTitle,
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

    const announceChanges = selectAnnouncementChanges(
      rows.map((r) => ({
        field: r.payload.field,
        from: r.payload.from,
        to: r.payload.to,
      }))
    );
    const announceFieldSet = new Set(announceChanges.map((c) => c.field));

    const inserted = await TaskActivityLog.insertMany(rows, { ordered: true });
    const docsForAnnounce = (Array.isArray(inserted) ? inserted : []).filter((doc) =>
      announceFieldSet.has(String(doc?.payload?.field || ''))
    );
    // Prefer status row over listId when both inserted
    let toPublish = docsForAnnounce;
    if (docsForAnnounce.some((d) => d.payload?.field === 'status')) {
      toPublish = docsForAnnounce.filter((d) => d.payload?.field !== 'listId');
    }
    if (toPublish.length && asOid(taskId)) {
      void publishAnnouncementFromHistoryRows({
        organizationId: orgOid,
        projectId: projectOid,
        boardId: asOid(boardId) || null,
        taskId: asOid(taskId),
        actorId: actorOid,
        insertedDocs: toPublish,
      });
    }
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
  const items = await enrichHistoryItemsWithLabels(docs.flatMap(expandLegacyUpdated), {
    boardId: task.boardId || null,
  });
  return { items };
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
  const items = await enrichHistoryItemsWithLabels(docs.flatMap(expandLegacyUpdated), {
    boardId: null,
  });
  return { items };
}

module.exports = {
  appendFieldChanges,
  listTaskHistory,
  listPlanningItemHistory,
};
