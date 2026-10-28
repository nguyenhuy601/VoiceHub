/**
 * Staffing fallback MVP: suggest replace, short-horizon fail, PM override.
 */

const mongoose = require('../db');
const { logger } = require('@enterprise/shared');
const Task = require('../models/Task');
const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const {
  classifyStaffingFallback,
  remainingCalendarDays,
} = require('../utils/task/staffingFallback');
const { scoreFallbackCandidateAgainstTags } = require('../utils/staffing/capabilityMatch');
const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { recordSelectiveMutationAudit } = require('./audit.service');
const { collectTaskAssigneeIds } = require('../utils/task/taskAssignee');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

async function appendProjectOperationalLog(projectId, entry) {
  const pid = asOid(projectId);
  if (!pid || !entry) return;
  try {
    await Project.updateOne(
      { _id: pid },
      {
        $push: {
          operationalLog: {
            ...entry,
            at: entry.at || new Date().toISOString(),
          },
        },
      }
    );
  } catch (err) {
    logger.warn('[staffing-fallback] operationalLog push failed: %s', err?.message || err);
  }
}

/**
 * Suggest other project members as replace candidates (ranked by tag/skill overlap).
 * HITL only — does not mutate assignee.
 */
async function suggestReplaceCandidates({ taskId, actorUserId, limit = 5 } = {}) {
  const tid = asOid(taskId);
  if (!tid) {
    const err = new Error('taskId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const task = await Task.findById(tid).lean();
  if (!task || task.isActive === false) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const projectId = asOid(task.projectId);
  if (!projectId) {
    const err = new Error('Task chưa gắn project');
    err.statusCode = 400;
    throw err;
  }
  await assertUserProjectPermission({
    userId: actorUserId,
    projectId,
    permission: 'task:view',
    message: 'Không có quyền xem gợi ý thay người',
  });

  const kind = classifyStaffingFallback(task);
  const currentAssignees = new Set(collectTaskAssigneeIds(task).map(String));
  const taskTags = Array.isArray(task.tags)
    ? task.tags.map((t) => String(t || '').trim()).filter(Boolean)
    : [];
  const memberships = await ProjectMembership.find({ projectId })
    .select('userId')
    .lean()
    .limit(80);
  const memberIds = [];
  for (const m of memberships || []) {
    const uid = String(m.userId || '').trim();
    if (!uid || currentAssignees.has(uid)) continue;
    memberIds.push(uid);
  }

  let profileMap = new Map();
  try {
    profileMap = await fetchProfilesByUserIds(memberIds);
  } catch (err) {
    logger.warn('[staffing-fallback] profile batch failed: %s', err?.message || err);
  }

  const ranked = [];
  for (const uid of memberIds) {
    const profile = profileMap.get(uid) || null;
    const cap = profile?.capability || null;
    const verifiedCapability =
      cap && String(cap.verificationStatus || '') === 'verified' ? cap : null;
    const scored = scoreFallbackCandidateAgainstTags({
      capability: cap,
      verifiedCapability,
      taskTags,
    });
    const row = {
      userId: uid,
      source: 'project_membership',
      score: scored.score || 0,
      reasons: scored.reasons || [],
    };
    if (scored.matched?.length) row.matched = scored.matched.slice(0, 12);
    const displayName =
      profile?.displayName || profile?.fullName || profile?.username || null;
    if (displayName) row.displayName = String(displayName).trim().slice(0, 120);
    ranked.push(row);
  }

  ranked.sort((a, b) => b.score - a.score || String(a.userId).localeCompare(String(b.userId)));
  const topN = Math.min(20, Math.max(1, Number(limit) || 5));
  const candidates = ranked.slice(0, topN);

  return {
    taskId: tid,
    projectId,
    kind,
    remainingCalendarDays: remainingCalendarDays(task),
    currentAssigneeIds: [...currentAssignees],
    taskTags,
    candidates,
  };
}

/**
 * PM override: reassign + audit fallback_override + operationalLog.
 */
async function applyPmOverrideReassign({
  taskId,
  actorUserId,
  toUserId,
  reason = '',
  requestId = '',
} = {}) {
  const tid = asOid(taskId);
  const toUid = asOid(toUserId);
  if (!tid || !toUid) {
    const err = new Error('taskId và toUserId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const task = await Task.findById(tid);
  if (!task || task.isActive === false) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const projectId = asOid(task.projectId);
  if (!projectId) {
    const err = new Error('Task chưa gắn project');
    err.statusCode = 400;
    throw err;
  }
  await assertUserProjectPermission({
    userId: actorUserId,
    projectId,
    permission: 'task:assign',
    message: 'Chỉ PM/người có task:assign được override phân công',
  });

  const fromUserId = task.assigneeId ? String(task.assigneeId) : null;
  const before = { assigneeId: fromUserId };
  task.assigneeId = toUid;
  await task.save();

  await recordSelectiveMutationAudit({
    organizationId: task.organizationId,
    actorUserId,
    action: 'fallback_override',
    resourceType: 'task',
    resourceId: tid,
    beforeDoc: before,
    afterDoc: { assigneeId: toUid },
    keys: ['assigneeId'],
    requestId,
    meta: {
      reason: String(reason || '').slice(0, 500),
      projectId,
      source: 'pm_override',
    },
  });

  await appendProjectOperationalLog(projectId, {
    type: 'reassignment',
    source: 'fallback_override',
    taskId: tid,
    fromUserId,
    toUserId: toUid,
    reason: String(reason || '').slice(0, 500) || null,
    actorUserId: String(actorUserId),
  });

  return {
    taskId: tid,
    projectId,
    fromUserId,
    toUserId: toUid,
  };
}

/**
 * Mark short-horizon fail (cancel task) + audit + operationalLog.
 */
async function markFailedShortHorizon({ taskId, actorUserId, reason = '', requestId = '' } = {}) {
  const tid = asOid(taskId);
  if (!tid) {
    const err = new Error('taskId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const task = await Task.findById(tid);
  if (!task || task.isActive === false) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const projectId = asOid(task.projectId);
  if (!projectId) {
    const err = new Error('Task chưa gắn project');
    err.statusCode = 400;
    throw err;
  }
  await assertUserProjectPermission({
    userId: actorUserId,
    projectId,
    permission: 'task:update',
    message: 'Không có quyền đánh dấu fail short-horizon',
  });

  const kind = classifyStaffingFallback(task);
  if (kind !== 'fail_short_horizon') {
    const err = new Error('Task chưa thuộc nhánh fail short-horizon (< 1 ngày còn lại / quá hạn)');
    err.statusCode = 400;
    err.errorCode = 'NOT_SHORT_HORIZON';
    throw err;
  }

  const before = { status: task.status };
  task.status = 'cancelled';
  await task.save();

  await recordSelectiveMutationAudit({
    organizationId: task.organizationId,
    actorUserId,
    action: 'failed_short_horizon',
    resourceType: 'task',
    resourceId: tid,
    beforeDoc: before,
    afterDoc: { status: 'cancelled' },
    keys: ['status'],
    requestId,
    meta: {
      reason: String(reason || '').slice(0, 500),
      projectId,
      remainingCalendarDays: remainingCalendarDays(task),
    },
  });

  await appendProjectOperationalLog(projectId, {
    type: 'failed_short_horizon',
    taskId: tid,
    fromStatus: before.status,
    toStatus: 'cancelled',
    reason: String(reason || '').slice(0, 500) || null,
    actorUserId: String(actorUserId),
    remainingCalendarDays: remainingCalendarDays(task),
  });

  return { taskId: tid, projectId, status: 'cancelled' };
}

/**
 * Best-effort hook from due-reminder job: classify + notify payload for PM (no auto-assign).
 */
function buildFallbackNotifyPayload(task, now = new Date()) {
  const kind = classifyStaffingFallback(task, { now });
  if (!kind) return null;
  return {
    kind,
    taskId: String(task._id || ''),
    projectId: task.projectId ? String(task.projectId) : '',
    remainingCalendarDays: remainingCalendarDays(task, now),
    title: String(task.title || '').trim(),
  };
}

module.exports = {
  suggestReplaceCandidates,
  applyPmOverrideReassign,
  markFailedShortHorizon,
  buildFallbackNotifyPayload,
  appendProjectOperationalLog,
};
