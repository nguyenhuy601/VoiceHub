const { logger } = require('@enterprise/shared');

const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const TaskBoardList = require('../models/TaskBoardList');

const { classifySprintClosureTasks } = require('../utils/sprintCloseClassify');

function asStringOid(v) {
  return String(v || '').trim();
}

function isFiniteNonNegativeHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function normalizeIncompleteAction(value) {
  const s = asStringOid(value).toLowerCase();
  if (!s) return '';
  if (s === 'backlog') return 'backlog';
  if (s === 'sprint') return 'sprint';
  return '';
}

function validateTargetSprintStatus(s) {
  const st = asStringOid(s).toLowerCase();
  return ['planned', 'active'].includes(st);
}

async function getDeps(overrides = {}) {
  // Lazy-require để tránh side-effects env (vd ORGANIZATION_SERVICE_URL)
  // khi unit test inject deps sẵn.
  let assertUserAnyProjectPermission =
    typeof overrides?.assertUserAnyProjectPermission === 'function'
      ? overrides.assertUserAnyProjectPermission
      : null;
  if (!assertUserAnyProjectPermission) {
    // eslint-disable-next-line global-require
    const projectAccess = require('./projectAccess.service');
    assertUserAnyProjectPermission = projectAccess.assertUserAnyProjectPermission;
  }

  let recordAuditImpl =
    typeof overrides?.recordAudit === 'function' ? overrides.recordAudit : null;
  if (!recordAuditImpl) {
    // eslint-disable-next-line global-require
    const audit = require('./audit.service');
    recordAuditImpl = audit.recordAudit;
  }

  return {
    Sprint,
    Task,
    TaskBoardList,
    recordAudit: recordAuditImpl,
    assertUserAnyProjectPermission,
    ...(overrides || {}),
  };
}

async function assertCanCloseSprint({ userId, projectId, deps, message }) {
  const { assertUserAnyProjectPermission } = deps;
  if (typeof assertUserAnyProjectPermission !== 'function') return;
  await assertUserAnyProjectPermission({
    userId,
    projectId,
    permissions: ['sprint:close', 'project:edit'],
    message,
  });
}

async function loadSprintOrThrow({ deps, projectId, sprintId }) {
  const sprint = await deps.Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    const err = new Error('Sprint không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return sprint;
}

async function loadSprintTasksAndLists({ deps, projectId, sprintId }) {
  const tasks = await deps.Task.find({
    projectId,
    sprintId,
    isActive: { $ne: false },
  })
    .select('_id status listId estimateHours')
    .lean();

  const listIds = Array.from(
    new Set(
      (tasks || [])
        .map((t) => (t?.listId ? asStringOid(t.listId) : ''))
        .filter(Boolean)
    )
  );

  const lists = listIds.length
    ? await deps.TaskBoardList.find({ _id: { $in: listIds } })
        .select('_id statusKey title')
        .lean()
    : [];

  const listsById = {};
  for (const l of lists || []) {
    listsById[asStringOid(l._id)] = l;
  }

  return { tasks: tasks || [], listsById };
}

function buildClosureSnapshot({ now, stats, incompleteAction, targetSprintId, issueIds }) {
  return {
    at: now,
    committedHours: stats.committedHours,
    completedHours: stats.completedHours,
    incompleteHours: stats.incompleteHours,
    doneCount: stats.doneCount,
    incompleteCount: stats.incompleteCount,
    incompleteAction,
    targetSprintId: targetSprintId || null,
    doneIssueIds: issueIds.doneTaskIds,
    incompleteIssueIds: issueIds.incompleteTaskIds,
  };
}

async function recordSprintCloseAudit({
  deps,
  organizationId,
  actorUserId,
  sprintId,
  beforeStatus,
  afterStatus,
  closedAt,
  closedBy,
  stats,
  incompleteAction,
  targetSprintId,
}) {
  if (!deps.recordAudit) return;
  try {
    await deps.recordAudit({
      organizationId,
      actorUserId,
      action: 'sprint.closed',
      resourceType: 'sprint',
      resourceId: sprintId,
      before: { status: beforeStatus },
      after: { status: afterStatus, closedAt, closedBy },
      meta: {
        committedHours: stats.committedHours,
        completedHours: stats.completedHours,
        incompleteHours: stats.incompleteHours,
        doneCount: stats.doneCount,
        incompleteCount: stats.incompleteCount,
        incompleteAction,
        targetSprintId: targetSprintId || null,
      },
    });
  } catch (err) {
    logger.warn('[sprint-close] audit failed: %s', err.message);
  }
}

async function getCompleteSprintPreview({ userId, projectId, sprintId, deps: depsOverrides }) {
  const deps = await getDeps(depsOverrides);
  const sprint = await loadSprintOrThrow({ deps, projectId, sprintId });

  await assertCanCloseSprint({
    userId,
    projectId,
    deps,
    message: 'Không có quyền đóng sprint',
  });

  if (String(sprint.status || '').toLowerCase() !== 'active') {
    const err = new Error('Sprint phải ở trạng thái active để đóng');
    err.statusCode = 400;
    throw err;
  }

  const { tasks, listsById } = await loadSprintTasksAndLists({ deps, projectId, sprintId });
  const stats = classifySprintClosureTasks({ tasks, listsById });

  const destinationSprints = await deps.Sprint.find({
    projectId,
    status: { $in: ['planned', 'active'] },
    _id: { $ne: sprintId },
  })
    .select('_id name status')
    .lean();

  return {
    sprintId: asStringOid(sprint._id),
    status: sprint.status,
    doneCount: stats.doneCount,
    incompleteCount: stats.incompleteCount,
    committedHours: stats.committedHours,
    completedHours: stats.completedHours,
    incompleteHours: stats.incompleteHours,
    incompleteIssueIds: stats.incompleteTaskIds,
    destinationSprints: (destinationSprints || []).map((s) => ({
      sprintId: asStringOid(s._id),
      name: String(s.name || '').trim(),
      status: s.status,
    })),
  };
}

async function completeSprint({
  userId,
  projectId,
  sprintId,
  incompleteAction,
  targetSprintId,
  deps: depsOverrides,
}) {
  const deps = await getDeps(depsOverrides);
  const sprint = await loadSprintOrThrow({ deps, projectId, sprintId });

  await assertCanCloseSprint({
    userId,
    projectId,
    deps,
    message: 'Không có quyền đóng sprint',
  });

  if (String(sprint.status || '').toLowerCase() !== 'active') {
    const err = new Error('Sprint phải ở trạng thái active để đóng');
    err.statusCode = 400;
    throw err;
  }

  const { tasks, listsById } = await loadSprintTasksAndLists({ deps, projectId, sprintId });
  const stats = classifySprintClosureTasks({ tasks, listsById });

  const now = new Date();
  const incompleteCount = stats.incompleteCount;
  const normalizedIncompleteAction = normalizeIncompleteAction(incompleteAction);

  let finalTargetSprintId = null;
  if (incompleteCount > 0) {
    if (!normalizedIncompleteAction) {
      const err = new Error('Sprint còn incomplete: thiếu incompleteAction');
      err.statusCode = 400;
      throw err;
    }

    if (normalizedIncompleteAction === 'sprint') {
      if (!targetSprintId) {
        const err = new Error('Thiếu targetSprintId khi incompleteAction=sprint');
        err.statusCode = 400;
        throw err;
      }

      const target = await deps.Sprint.findOne({
        _id: targetSprintId,
        projectId,
      }).lean();
      if (!target) {
        const err = new Error('targetSprint không tồn tại');
        err.statusCode = 404;
        throw err;
      }
      if (!validateTargetSprintStatus(target.status)) {
        const err = new Error('targetSprint phải planned hoặc active');
        err.statusCode = 400;
        throw err;
      }

      const closingId = asStringOid(sprint._id);
      const targetId = asStringOid(targetSprintId);
      if (targetId === closingId) {
        const err = new Error('targetSprint không được trùng sprint đang đóng');
        err.statusCode = 400;
        throw err;
      }
      finalTargetSprintId = targetId;
    }
  }

  // Carry-over chỉ ảnh hưởng sprintId của incomplete tasks
  if (incompleteCount > 0 && stats.incompleteTaskIds.length) {
    const nextSprintId = normalizedIncompleteAction === 'sprint' ? finalTargetSprintId : null;
    await deps.Task.updateMany(
      { projectId, sprintId, _id: { $in: stats.incompleteTaskIds } },
      { $set: { sprintId: nextSprintId } }
    );
  }

  const beforeStatus = sprint.status;
  sprint.status = 'closed';
  sprint.closedAt = now;
  sprint.closedBy = userId;
  sprint.closureSnapshot = buildClosureSnapshot({
    now,
    stats,
    incompleteAction: normalizedIncompleteAction || null,
    targetSprintId: finalTargetSprintId,
    issueIds: {
      doneTaskIds: stats.doneTaskIds,
      incompleteTaskIds: stats.incompleteTaskIds,
    },
  });

  await sprint.save();

  await recordSprintCloseAudit({
    deps,
    organizationId: sprint.organizationId,
    actorUserId: userId,
    sprintId: asStringOid(sprint._id),
    beforeStatus,
    afterStatus: sprint.status,
    closedAt: sprint.closedAt,
    closedBy: sprint.closedBy,
    stats,
    incompleteAction: normalizedIncompleteAction || null,
    targetSprintId: finalTargetSprintId,
  });

  const report = {
    velocityHours: stats.completedHours,
    completedCount: stats.doneCount,
    incompleteMoved: stats.incompleteTaskIds.length,
    incompleteAction: normalizedIncompleteAction || null,
    targetSprintId: finalTargetSprintId,
  };

  return {
    sprint: sprint.toObject ? sprint.toObject() : sprint,
    report,
  };
}

module.exports = {
  getCompleteSprintPreview,
  completeSprint,
};

