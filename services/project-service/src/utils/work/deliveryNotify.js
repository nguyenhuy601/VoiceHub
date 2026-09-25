/**
 * Plan C — Notify đề xuất Done / Release Ready / UAT (DEC D1–D8).
 * Pure dedupe helpers + async emit (S2S notifySystemKind). Fail → log, không throw.
 */

const KIND = Object.freeze({
  READY_TO_DONE: 'ready_to_done_proposed',
  RELEASE_READY: 'release_ready_proposed',
  UAT_REQUESTED: 'uat_requested',
  READY_FOR_QA: 'ready_for_qa',
});

const READY_FOR_QA_ROLE_KEYS = Object.freeze([
  'qa_lead',
  'qa_engineer',
  'qa',
  'tester',
]);

function warnLog(...args) {
  try {
    const { logger } = require('@enterprise/shared');
    logger.warn(...args);
  } catch {
    console.warn(...args);
  }
}

function infoLog(...args) {
  try {
    const { logger } = require('@enterprise/shared');
    logger.info(...args);
  } catch {
    /* ignore in unit */
  }
}
function isDeliveryNotifyEnabled() {
  const v = String(process.env.DELIVERY_NOTIFY_ENABLED || '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

/**
 * D5 — Ready-to-Done: notify khi sẵn sàng và chưa stamp; clear stamp khi không còn ready.
 * @returns {'notify'|'skip'|'clear'}
 */
function readyToDoneDedupeAction({ isReady, notifiedAt }) {
  if (isReady) return notifiedAt ? 'skip' : 'notify';
  return notifiedAt ? 'clear' : 'skip';
}

/**
 * D5 — Release Ready proposed (chưa confirmed).
 * @returns {'notify'|'skip'|'clear'}
 */
function releaseReadyDedupeAction({ isReady, releaseReadyStatus, notifiedAt }) {
  if (String(releaseReadyStatus || 'none') === 'confirmed') {
    return notifiedAt ? 'clear' : 'skip';
  }
  if (isReady) return notifiedAt ? 'skip' : 'notify';
  return notifiedAt ? 'clear' : 'skip';
}

function shouldNotifyUatRequested({ uatStatus }) {
  return String(uatStatus || 'none') !== 'pass';
}

/** Enter Ready for QA: notify once; leave column: clear stamp. */
function readyForQaDedupeAction({ isInReadyForQa, notifiedAt }) {
  if (isInReadyForQa) return notifiedAt ? 'skip' : 'notify';
  return notifiedAt ? 'clear' : 'skip';
}

/**
 * @param {{ projectId: string, permission: string }} opts
 * @returns {Promise<string[]>}
 */
async function resolveProjectMemberUserIdsByPermission({ projectId, permission }) {
  const pid = String(projectId || '').trim();
  const perm = String(permission || '').trim();
  if (!pid || !perm) return [];

  const Project = require('../../models/Project');
  const ProjectMembership = require('../../models/ProjectMembership');
  const {
    resolveUserProjectPermissions,
    hasPermission,
  } = require('../../services/projectAccess.service');

  const project = await Project.findById(pid).select('_id createdBy').lean();
  if (!project) return [];

  const rows = await ProjectMembership.find({ projectId: pid }).select('userId').lean();
  const candidates = new Set(
    rows.map((r) => String(r.userId || '').trim()).filter(Boolean)
  );
  if (project.createdBy) candidates.add(String(project.createdBy));

  const out = [];
  for (const uid of candidates) {
    try {
      const resolved = await resolveUserProjectPermissions({ userId: uid, projectId: pid });
      if (
        resolved.isOrgAdmin ||
        resolved.isCreator ||
        hasPermission(resolved.permissions, perm)
      ) {
        out.push(uid);
      }
    } catch {
      /* skip broken member */
    }
  }
  return [...new Set(out)];
}

/**
 * QA roles first; fallback task:drag_to_done (PM/TL/QA) nếu chưa có QA trên dự án.
 * @param {{ projectId: string }} opts
 * @returns {Promise<string[]>}
 */
async function resolveReadyForQaRecipientUserIds({ projectId }) {
  const pid = String(projectId || '').trim();
  if (!pid) return [];

  const Project = require('../../models/Project');
  const ProjectMembership = require('../../models/ProjectMembership');
  const ProjectRole = require('../../models/ProjectRole');

  const project = await Project.findById(pid).select('_id createdBy').lean();
  if (!project) return [];

  const rows = await ProjectMembership.find({ projectId: pid })
    .select('userId projectRoleId')
    .lean();
  const roleIds = [
    ...new Set(rows.map((r) => String(r.projectRoleId || '').trim()).filter(Boolean)),
  ];
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('_id key').lean()
    : [];
  const roleKeyById = new Map(
    roles.map((r) => [String(r._id), String(r.key || '').trim().toLowerCase()])
  );
  const qaKeys = new Set(READY_FOR_QA_ROLE_KEYS);
  const byRole = [
    ...new Set(
      rows
        .filter((r) => qaKeys.has(roleKeyById.get(String(r.projectRoleId || '')) || ''))
        .map((r) => String(r.userId || '').trim())
        .filter(Boolean)
    ),
  ];
  if (byRole.length) return byRole;

  return resolveProjectMemberUserIdsByPermission({
    projectId: pid,
    permission: 'task:drag_to_done',
  });
}

async function emitSystemKind({
  kind,
  userIds,
  title,
  content,
  data,
  actionUrl,
  excludeUserId,
}) {
  if (!isDeliveryNotifyEnabled()) return { ok: false, reason: 'disabled' };
  const { notifySystemKind } = require('../../clients/notification.client');
  try {
    const ok = await notifySystemKind({
      userIds,
      kind,
      title,
      content,
      data,
      actionUrl,
      excludeUserId,
    });
    return { ok: Boolean(ok), reason: ok ? 'sent' : 'no_recipients_or_s2s' };
  } catch (err) {
    warnLog('[deliveryNotify] emit failed kind=%s: %s', kind, err?.message || err);
    return { ok: false, reason: 'error' };
  }
}

/**
 * After a write that may flip Ready-to-Done for a work item card.
 */
async function maybeNotifyReadyToDoneProposed({
  actorId,
  projectId,
  organizationId,
  boardId,
  taskId,
  taskTitle,
}) {
  if (!isDeliveryNotifyEnabled()) return { action: 'skip', reason: 'disabled' };
  const Task = require('../../models/Task');
  const TaskBoardList = require('../../models/TaskBoardList');
  const { evaluateForWorkItem } = require('../../services/readyToDone.service');
  const { isDoneListTitle } = require('../../services/boardCapabilities');
  const { projectHubActionUrl } = require('../../clients/notification.client');

  const tid = String(taskId || '').trim();
  const pid = String(projectId || '').trim();
  if (!tid || !pid) return { action: 'skip', reason: 'missing_ids' };

  try {
    const task = await Task.findOne({ _id: tid, projectId: pid, isActive: true });
    if (!task) return { action: 'skip', reason: 'task_missing' };

    let isDone = false;
    if (task.listId) {
      const list = await TaskBoardList.findById(task.listId).select('title').lean();
      isDone = isDoneListTitle(list?.title);
    }
    if (isDone) {
      if (task.readyToDoneNotifiedAt) {
        task.readyToDoneNotifiedAt = null;
        await task.save();
        return { action: 'clear', reason: 'already_done' };
      }
      return { action: 'skip', reason: 'already_done' };
    }

    const evaluation = await evaluateForWorkItem(pid, tid);
    const action = readyToDoneDedupeAction({
      isReady: Boolean(evaluation.ready),
      notifiedAt: task.readyToDoneNotifiedAt,
    });

    if (action === 'clear') {
      task.readyToDoneNotifiedAt = null;
      await task.save();
      return { action: 'clear' };
    }
    if (action !== 'notify') return { action: 'skip' };

    const userIds = await resolveProjectMemberUserIdsByPermission({
      projectId: pid,
      permission: 'task:drag_to_done',
    });
    const titleText = String(taskTitle || task.title || 'Thẻ').trim() || 'Thẻ';
    const org = String(organizationId || task.organizationId || '');
    const bid = String(boardId || task.boardId || '');
    const sent = await emitSystemKind({
      kind: KIND.READY_TO_DONE,
      userIds,
      title: 'Sẵn sàng xác nhận Done',
      content: `Thẻ “${titleText}” đủ điều kiện — cần Confirm Done.`,
      data: {
        organizationId: org,
        projectId: pid,
        boardId: bid,
        taskId: tid,
      },
      actionUrl: projectHubActionUrl({ projectId: pid, boardId: bid, organizationId: org }),
      excludeUserId: actorId,
    });

    task.readyToDoneNotifiedAt = new Date();
    await task.save();
    infoLog(
      `[deliveryNotify] kind=${KIND.READY_TO_DONE} project=${pid} task=${tid} recipients~${userIds.length} ok=${sent.ok}`
    );
    return { action: 'notify', sent };
  } catch (err) {
    warnLog('[deliveryNotify] ready_to_done failed: %s', err?.message || err);
    return { action: 'skip', reason: 'error' };
  }
}

/**
 * After a write that may flip project Release Ready.
 */
async function maybeNotifyReleaseReadyProposed({ actorId, projectId }) {
  if (!isDeliveryNotifyEnabled()) return { action: 'skip', reason: 'disabled' };
  const Project = require('../../models/Project');
  const { buildEvaluation } = require('../../services/releaseReady.service');
  const { projectHubActionUrl } = require('../../clients/notification.client');

  const pid = String(projectId || '').trim();
  if (!pid) return { action: 'skip', reason: 'missing_ids' };

  try {
    const project = await Project.findById(pid);
    if (!project || project.isActive === false) return { action: 'skip', reason: 'project_missing' };

    const evaluation = await buildEvaluation(project);
    const action = releaseReadyDedupeAction({
      isReady: Boolean(evaluation.ready),
      releaseReadyStatus: project.releaseReadyStatus,
      notifiedAt: project.releaseReadyNotifiedAt,
    });

    if (action === 'clear') {
      project.releaseReadyNotifiedAt = null;
      await project.save();
      return { action: 'clear' };
    }
    if (action !== 'notify') return { action: 'skip' };

    const userIds = await resolveProjectMemberUserIdsByPermission({
      projectId: pid,
      permission: 'delivery_phase:change',
    });
    const name = String(project.name || project.code || 'Dự án').trim() || 'Dự án';
    const org = String(project.organizationId || '');
    const sent = await emitSystemKind({
      kind: KIND.RELEASE_READY,
      userIds,
      title: 'Sẵn sàng Confirm Release Ready',
      content: `Dự án “${name}” đủ điều kiện Release Ready — cần Confirm.`,
      data: {
        organizationId: org,
        projectId: pid,
      },
      actionUrl: projectHubActionUrl({ projectId: pid, organizationId: org }),
      excludeUserId: actorId,
    });

    project.releaseReadyNotifiedAt = new Date();
    await project.save();
    infoLog(
      `[deliveryNotify] kind=${KIND.RELEASE_READY} project=${pid} recipients~${userIds.length} ok=${sent.ok}`
    );
    return { action: 'notify', sent };
  } catch (err) {
    warnLog('[deliveryNotify] release_ready failed: %s', err?.message || err);
    return { action: 'skip', reason: 'error' };
  }
}

/**
 * After Confirm Release Ready success — ask for UAT.
 */
async function notifyUatRequested({ actorId, project }) {
  if (!isDeliveryNotifyEnabled()) return { action: 'skip', reason: 'disabled' };
  if (!project) return { action: 'skip', reason: 'missing_project' };
  if (!shouldNotifyUatRequested({ uatStatus: project.uatStatus })) {
    return { action: 'skip', reason: 'uat_already_pass' };
  }

  const { projectHubActionUrl } = require('../../clients/notification.client');
  const pid = String(project._id || '');
  try {
    const userIds = await resolveProjectMemberUserIdsByPermission({
      projectId: pid,
      permission: 'uat:sign_off',
    });
    const name = String(project.name || project.code || 'Dự án').trim() || 'Dự án';
    const org = String(project.organizationId || '');
    const sent = await emitSystemKind({
      kind: KIND.UAT_REQUESTED,
      userIds,
      title: 'Release Ready — cần UAT',
      content: `Dự án “${name}” đã Confirm Release Ready — cần UAT sign-off.`,
      data: {
        organizationId: org,
        projectId: pid,
      },
      actionUrl: projectHubActionUrl({ projectId: pid, organizationId: org }),
      excludeUserId: actorId,
    });
    infoLog(
      `[deliveryNotify] kind=${KIND.UAT_REQUESTED} project=${pid} recipients~${userIds.length} ok=${sent.ok}`
    );
    return { action: 'notify', sent };
  } catch (err) {
    warnLog('[deliveryNotify] uat_requested failed: %s', err?.message || err);
    return { action: 'skip', reason: 'error' };
  }
}

/**
 * After card move into / out of Ready for QA column.
 */
async function maybeNotifyReadyForQa({
  actorId,
  projectId,
  organizationId,
  boardId,
  taskId,
  taskTitle,
  toList,
  fromList,
}) {
  if (!isDeliveryNotifyEnabled()) return { action: 'skip', reason: 'disabled' };
  const Task = require('../../models/Task');
  const { isReadyForQaList } = require('../../services/boardCapabilities');
  const { projectHubActionUrl } = require('../../clients/notification.client');

  const tid = String(taskId || '').trim();
  const pid = String(projectId || '').trim();
  if (!tid || !pid) return { action: 'skip', reason: 'missing_ids' };

  try {
    const isInReadyForQa = isReadyForQaList(toList);
    const wasInReadyForQa = isReadyForQaList(fromList);
    if (isInReadyForQa === wasInReadyForQa && !isInReadyForQa) {
      return { action: 'skip', reason: 'not_qa_transition' };
    }

    const task = await Task.findOne({ _id: tid, projectId: pid, isActive: true });
    if (!task) return { action: 'skip', reason: 'task_missing' };

    const action = readyForQaDedupeAction({
      isInReadyForQa,
      notifiedAt: task.readyForQaNotifiedAt,
    });

    if (action === 'clear') {
      task.readyForQaNotifiedAt = null;
      await task.save();
      return { action: 'clear' };
    }
    if (action !== 'notify') return { action: 'skip' };

    const userIds = await resolveReadyForQaRecipientUserIds({ projectId: pid });
    const titleText = String(taskTitle || task.title || 'Thẻ').trim() || 'Thẻ';
    const org = String(organizationId || task.organizationId || '');
    const bid = String(boardId || task.boardId || '');
    const sent = await emitSystemKind({
      kind: KIND.READY_FOR_QA,
      userIds,
      title: 'Card sẵn sàng kiểm thử',
      content: `Thẻ “${titleText}” đã vào Ready for QA — mở Kiểm thử để gắn test case.`,
      data: {
        organizationId: org,
        projectId: pid,
        boardId: bid,
        taskId: tid,
      },
      actionUrl: projectHubActionUrl({
        projectId: pid,
        boardId: bid,
        organizationId: org,
        module: 'test-cases',
      }),
      excludeUserId: actorId,
    });

    task.readyForQaNotifiedAt = new Date();
    await task.save();
    infoLog(
      `[deliveryNotify] kind=${KIND.READY_FOR_QA} project=${pid} task=${tid} recipients~${userIds.length} ok=${sent.ok}`
    );
    return { action: 'notify', sent };
  } catch (err) {
    warnLog('[deliveryNotify] ready_for_qa failed: %s', err?.message || err);
    return { action: 'skip', reason: 'error' };
  }
}

/** Fire-and-forget wrapper for write handlers. */
function scheduleDeliveryNotify(fn) {
  try {
    void Promise.resolve()
      .then(fn)
      .catch((err) => {
        warnLog('[deliveryNotify] schedule error: %s', err?.message || err);
      });
  } catch (err) {
    warnLog('[deliveryNotify] schedule sync error: %s', err?.message || err);
  }
}

module.exports = {
  KIND,
  READY_FOR_QA_ROLE_KEYS,
  isDeliveryNotifyEnabled,
  readyToDoneDedupeAction,
  releaseReadyDedupeAction,
  readyForQaDedupeAction,
  shouldNotifyUatRequested,
  resolveProjectMemberUserIdsByPermission,
  resolveReadyForQaRecipientUserIds,
  maybeNotifyReadyToDoneProposed,
  maybeNotifyReleaseReadyProposed,
  maybeNotifyReadyForQa,
  notifyUatRequested,
  scheduleDeliveryNotify,
};
