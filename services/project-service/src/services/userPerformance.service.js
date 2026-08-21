/**
 * Historical Performance — C2 aggregate trên OLTP (project-service).
 * Dùng khi warehouse chưa có rollup; cũng là nguồn rebuild ETL.
 */

const mongoose = require('../db');
const Task = require('../models/Task');
const Worklog = require('../models/Worklog');
const ProjectMember = require('../models/ProjectMember');
const TaskActivityLog = require('../models/TaskActivityLog');
const ApprovalRequest = require('../models/ApprovalRequest');
const {
  buildUserPerformanceRollup,
  calibrateEstimateHours,
} = require('@enterprise/shared/analytics/performanceMetrics');
const { isDoneLikeStatus } = require('../utils/taskCycleTime');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const { resolveCanonicalOrganizationRoleKey } = require('@enterprise/shared/config/masterData');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function isOrgAdminScope(scope) {
  const role = String(scope?.membershipRole || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

/**
 * Admin / resource_manager / director xem org; user được xem chính mình.
 * @param {{ requireElevated?: boolean }} options — list org bắt buộc elevated
 */
async function assertPerformanceAccess({
  organizationId,
  actorUserId,
  targetUserId,
  requireElevated = false,
} = {}) {
  const scope = await fetchTaskWorkspaceScope(actorUserId, organizationId);
  if (!scope) {
    const err = new Error('Không có quyền truy cập tổ chức');
    err.statusCode = 403;
    throw err;
  }
  if (
    !requireElevated &&
    targetUserId &&
    String(actorUserId) === String(targetUserId)
  ) {
    return { scope, self: true };
  }
  if (isOrgAdminScope(scope)) {
    return { scope, isOrgAdmin: true };
  }
  const vis = await fetchProjectVisibilityContext(organizationId, actorUserId);
  const keys = (vis.organizationRoleKeys || []).map((k) =>
    resolveCanonicalOrganizationRoleKey(String(k || '').toLowerCase())
  );
  if (keys.includes('resource_manager') || keys.includes('director')) {
    return { scope, elevated: true };
  }
  const err = new Error(
    requireElevated
      ? 'Chỉ Org Admin, Director hoặc Resource Manager được xem danh sách performance'
      : 'Chỉ Org Admin, Director hoặc Resource Manager được xem performance của người khác'
  );
  err.statusCode = 403;
  err.errorCode = 'PERFORMANCE_FORBIDDEN';
  throw err;
}

function windowBounds(windowDays, asOf) {
  const end = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(end.getTime())) {
    const err = new Error('asOf không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const days = Math.max(1, Math.min(365, Number(windowDays) || 90));
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end, windowDays: days };
}

function taskLooksDone(task) {
  if (task?.completedAt) return true;
  return isDoneLikeStatus(task?.status);
}

/**
 * Scan activity logs for rework/reopen flags per taskId.
 */
async function loadTransitionFlags(taskIds) {
  const flags = new Map();
  if (!taskIds.length) return flags;
  const logs = await TaskActivityLog.find({
    taskId: { $in: taskIds },
    type: { $in: ['task.updated', 'status_changed', 'field_changes'] },
  })
    .select('taskId payload type')
    .lean()
    .limit(5000);

  for (const ev of logs) {
    const tid = String(ev.taskId);
    const payload = ev.payload && typeof ev.payload === 'object' ? ev.payload : {};
    const changes = Array.isArray(payload.changes) ? payload.changes : [];
    const statusChange = changes.find((c) => String(c?.field || '') === 'status');
    const from = statusChange?.from ?? payload.fromStatus ?? payload.from;
    const to = statusChange?.to ?? payload.toStatus ?? payload.to;
    if (from == null && to == null) continue;
    const row = flags.get(tid) || { hadRework: false, hadReopen: false };
    const fromS = String(from || '');
    const toS = String(to || '');
    if (isDoneLikeStatus(fromS) && !isDoneLikeStatus(toS)) row.hadReopen = true;
    if (/review/i.test(fromS) && !isDoneLikeStatus(toS) && toS && toS !== fromS) {
      row.hadRework = true;
    }
    flags.set(tid, row);
  }
  return flags;
}

/**
 * Aggregate Historical Performance without access assert.
 * Callers (pool/matcher) must already authorize the actor.
 */
async function getUserPerformanceUnchecked({
  organizationId,
  userId,
  windowDays = 90,
  asOf,
} = {}) {
  const orgId = asOid(organizationId);
  const uid = asOid(userId);
  if (!orgId || !uid) {
    const err = new Error('organizationId và userId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const { start, end, windowDays: days } = windowBounds(windowDays, asOf);

  const tasks = await Task.find({
    organizationId: orgId,
    assigneeId: uid,
    isActive: { $ne: false },
    $or: [
      { completedAt: { $gte: start, $lte: end } },
      {
        completedAt: null,
        status: { $regex: /done|complete/i },
        updatedAt: { $gte: start, $lte: end },
      },
    ],
  })
    .select(
      '_id estimateHours issueType status completedAt firstInProgressAt createdAt projectId'
    )
    .lean();

  const doneTasks = tasks.filter(taskLooksDone);
  const taskIds = doneTasks.map((t) => t._id);

  const worklogs = taskIds.length
    ? await Worklog.find({
        organizationId: orgId,
        userId: uid,
        taskId: { $in: taskIds },
      })
        .select('taskId hours')
        .lean()
    : [];

  const hoursByTask = new Map();
  let totalHoursLogged = 0;
  for (const w of worklogs) {
    const tid = String(w.taskId);
    const h = Number(w.hours) || 0;
    hoursByTask.set(tid, (hoursByTask.get(tid) || 0) + h);
    totalHoursLogged += h;
  }

  // Also count worklogs in window not tied to filtered tasks (experience hours)
  const windowLogs = await Worklog.find({
    organizationId: orgId,
    userId: uid,
    workDate: { $gte: start, $lte: end },
  })
    .select('hours')
    .lean();
  const windowHours = windowLogs.reduce((s, w) => s + (Number(w.hours) || 0), 0);
  if (windowHours > totalHoursLogged) totalHoursLogged = windowHours;

  const flags = await loadTransitionFlags(taskIds);

  const completedTasks = doneTasks.map((t) => {
    const tid = String(t._id);
    const f = flags.get(tid) || {};
    return {
      estimateHours: t.estimateHours,
      actualHours: hoursByTask.get(tid) || 0,
      issueType: t.issueType,
      completedAt: t.completedAt,
      firstInProgressAt: t.firstInProgressAt,
      createdAt: t.createdAt,
      hadRework: Boolean(f.hadRework),
      hadReopen: Boolean(f.hadReopen),
    };
  });

  const projectIds = [
    ...new Set(doneTasks.map((t) => String(t.projectId || '')).filter(Boolean)),
  ];
  let projectsCompleted = 0;
  if (projectIds.length) {
    projectsCompleted = await ProjectMember.countDocuments({
      organizationId: orgId,
      userId: uid,
      projectId: { $in: projectIds },
    });
  }

  let approvalRejected = 0;
  let approvalDecided = 0;
  try {
    const approvals = await ApprovalRequest.find({
      organizationId: orgId,
      'decisions.userId': uid,
      status: { $in: ['approved', 'rejected'] },
      updatedAt: { $gte: start, $lte: end },
    })
      .select('status decisions')
      .lean()
      .limit(500);
    for (const a of approvals) {
      const myDecisions = (a.decisions || []).filter(
        (d) => String(d.userId || '') === uid
      );
      for (const d of myDecisions) {
        approvalDecided += 1;
        if (String(d.decision || '').toLowerCase() === 'reject') {
          approvalRejected += 1;
        }
      }
    }
  } catch {
    /* optional metric */
  }

  return buildUserPerformanceRollup({
    organizationId: orgId,
    userId: uid,
    windowDays: days,
    asOf: end,
    completedTasks,
    totalHoursLogged,
    projectsCompleted,
    approvalRejected,
    approvalDecided,
  });
}

async function getUserPerformance({
  organizationId,
  userId,
  actorUserId,
  windowDays = 90,
  asOf,
} = {}) {
  const orgId = asOid(organizationId);
  const uid = asOid(userId);
  if (!orgId || !uid) {
    const err = new Error('organizationId và userId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  await assertPerformanceAccess({
    organizationId: orgId,
    actorUserId,
    targetUserId: uid,
  });

  return getUserPerformanceUnchecked({
    organizationId: orgId,
    userId: uid,
    windowDays,
    asOf,
  });
}

/**
 * Batch load rollups for pool/matcher. Fail-open per user (null entry omitted).
 * @returns {Map<string, object>}
 */
async function loadPerformanceByUserIds({
  organizationId,
  userIds = [],
  windowDays = 90,
  asOf,
} = {}) {
  const orgId = asOid(organizationId);
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const map = new Map();
  if (!orgId || !unique.length) return map;

  const concurrency = 5;
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const rows = await Promise.all(
      chunk.map(async (uid) => {
        try {
          const rollup = await getUserPerformanceUnchecked({
            organizationId: orgId,
            userId: uid,
            windowDays,
            asOf,
          });
          return { userId: uid, rollup };
        } catch {
          return { userId: uid, rollup: null };
        }
      })
    );
    for (const row of rows) {
      if (row.rollup) map.set(row.userId, row.rollup);
    }
  }
  return map;
}

/**
 * Org-wide list — top users by tasksCompleted in window (admin/resource manager).
 */
async function listUserPerformance({
  organizationId,
  actorUserId,
  windowDays = 90,
  asOf,
  limit = 50,
} = {}) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  await assertPerformanceAccess({
    organizationId: orgId,
    actorUserId,
    requireElevated: true,
  });

  const { start, end, windowDays: days } = windowBounds(windowDays, asOf);
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));

  const grouped = await Task.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(orgId),
        assigneeId: { $ne: null },
        isActive: { $ne: false },
        completedAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: '$assigneeId', tasksCompleted: { $sum: 1 } } },
    { $sort: { tasksCompleted: -1 } },
    { $limit: lim },
  ]);

  const items = [];
  for (const row of grouped) {
    const uid = String(row._id);
    try {
      const profile = await getUserPerformance({
        organizationId: orgId,
        userId: uid,
        actorUserId,
        windowDays: days,
        asOf: end,
      });
      items.push(profile);
    } catch {
      /* skip user on error */
    }
  }
  return { organizationId: orgId, windowDays: days, asOf: end.toISOString(), items };
}

async function getEstimateHints({
  organizationId,
  assigneeId,
  actorUserId,
  baselineHours,
  issueType,
  windowDays = 90,
} = {}) {
  const profile = await getUserPerformance({
    organizationId,
    userId: assigneeId,
    actorUserId,
    windowDays,
  });
  const base =
    baselineHours != null && Number.isFinite(Number(baselineHours))
      ? Number(baselineHours)
      : profile.estimation?.avgEstimateHours;
  const calibrated = calibrateEstimateHours({
    baselineHours: base,
    avgEstimateHours: profile.estimation?.avgEstimateHours,
    avgActualHours: profile.estimation?.avgActualHours,
    confidence: profile.confidence,
  });
  return {
    assigneeId: String(assigneeId),
    organizationId: String(organizationId),
    issueType: issueType || null,
    confidence: profile.confidence,
    sampleSize: profile.sampleSize,
    estimation: profile.estimation,
    calibration: calibrated,
    userPerformanceHints: {
      accuracyPct: profile.estimation?.accuracyPct,
      biasHours: profile.estimation?.biasHours,
      avgEstimateHours: profile.estimation?.avgEstimateHours,
      avgActualHours: profile.estimation?.avgActualHours,
      confidence: profile.confidence,
    },
  };
}

module.exports = {
  getUserPerformance,
  getUserPerformanceUnchecked,
  loadPerformanceByUserIds,
  listUserPerformance,
  getEstimateHints,
  windowBounds,
};
