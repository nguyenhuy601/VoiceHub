/**
 * Phase 1 gate policy — Tech optional, SoD between stamps (DEC D6–D8).
 */

const { hasPermission } = require('../utils/project/projectPermissionMatrix');

const GATE_SOD_ERROR = 'GATE_SOD_DENIED';

function isGateSodEnabled() {
  const v = String(process.env.PHASE1_GATE_SOD_ENABLED || '').trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return true;
}

/**
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
async function projectHasAnalysisTechReviewer(projectId) {
  const ProjectMembership = require('../models/ProjectMembership');
  const { resolveUserProjectPermissions } = require('../services/projectAccess.service');
  const memberships = await ProjectMembership.find({ projectId }).select('userId').lean();
  for (const m of memberships) {
    const resolved = await resolveUserProjectPermissions({
      userId: m.userId,
      projectId,
    });
    if (hasPermission(resolved.permissions, 'analysis:tech_review')) {
      return true;
    }
  }
  return false;
}

/**
 * Planning uses planning:tech_review (same people usually = tech_lead).
 * @param {string} projectId
 */
async function projectHasPlanningTechReviewer(projectId) {
  const ProjectMembership = require('../models/ProjectMembership');
  const { resolveUserProjectPermissions } = require('../services/projectAccess.service');
  const memberships = await ProjectMembership.find({ projectId }).select('userId').lean();
  for (const m of memberships) {
    const resolved = await resolveUserProjectPermissions({
      userId: m.userId,
      projectId,
    });
    if (hasPermission(resolved.permissions, 'planning:tech_review')) {
      return true;
    }
  }
  return false;
}

/**
 * @param {{ actorUserId: string, priorStamps?: Array<{ userId?: unknown } | null | undefined>, bypass?: boolean }} args
 */
function assertGateStampSoD({ actorUserId, priorStamps = [], bypass = false }) {
  if (!isGateSodEnabled() || bypass) return;
  const actor = String(actorUserId || '').trim();
  if (!actor) return;
  for (const stamp of priorStamps) {
    const prev = stamp?.userId != null ? String(stamp.userId).trim() : '';
    if (prev && prev === actor) {
      const err = new Error(
        'Separation of duties: cùng tài khoản không được duyệt liên tiếp / nhiều cổng — đổi account đúng role'
      );
      err.statusCode = 403;
      err.errorCode = GATE_SOD_ERROR;
      throw err;
    }
  }
}

/**
 * requirement:* is org/persona auth — NOT in project role matrix.
 * Map to matrix keys so gate notify finds BA/PM/PO on the project.
 * @see requirementAccess.service.js + projectPermissionMatrix.js
 */
const GATE_NOTIFY_PERM_ALIASES = Object.freeze({
  'requirement:submit': 'analysis:submit_ba_review',
  'requirement:approve': 'analysis:po_review',
  /** HOW done / Gate2 PM lane — PM chủ trì, không phải PO run-ai-planning */
  'requirement:run-ai-planning': 'planning:pm_review',
});

/**
 * @param {string} permission
 * @returns {string}
 */
function resolveGateNotifyPermission(permission) {
  const raw = String(permission || '').trim();
  if (!raw) return '';
  return GATE_NOTIFY_PERM_ALIASES[raw] || raw;
}

/**
 * Collect membership userIds that hold a permission.
 * @param {string} projectId
 * @param {string} permission
 * @returns {Promise<string[]>}
 */
async function userIdsWithProjectPermission(projectId, permission) {
  const matrixPerm = resolveGateNotifyPermission(permission);
  if (!matrixPerm) return [];
  const ProjectMembership = require('../models/ProjectMembership');
  const { resolveUserProjectPermissions } = require('../services/projectAccess.service');
  const memberships = await ProjectMembership.find({ projectId }).select('userId').lean();
  const out = [];
  for (const m of memberships) {
    const uid = String(m.userId || '').trim();
    if (!uid) continue;
    const resolved = await resolveUserProjectPermissions({ userId: uid, projectId });
    if (hasPermission(resolved.permissions, matrixPerm)) out.push(uid);
  }
  return [...new Set(out)];
}

/**
 * After a forward gate, notify next reviewers.
 */
async function notifyNextGateReviewers({
  projectId,
  organizationId,
  actorUserId,
  nextPermission,
  title,
  content,
  kind,
  actionPath = 'phase1/analysis-reviews',
  packId = '',
}) {
  if (!nextPermission) return;
  try {
    const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
    const userIds = await userIdsWithProjectPermission(projectId, nextPermission);
    if (!userIds.length) return;
    const pid = String(packId || '').trim();
    const basePath = String(actionPath || 'ai-hitl').replace(/^\/+/, '');
    const actionUrl = pid
      ? projectHubActionUrl({
          projectId,
          organizationId,
          // Gate 1 sequential review: open Duyệt tab directly
          pathSuffix: `${basePath}?packId=${encodeURIComponent(pid)}&tab=review`,
        })
      : projectHubActionUrl({
          projectId,
          organizationId,
          module: actionPath,
        });
    await notifySystemKind({
      userIds,
      kind: kind || 'phase1_gate_pending',
      title: title || 'Có mục chờ duyệt',
      content: content || 'Bạn có quyền duyệt cổng tiếp theo.',
      data: {
        projectId: String(projectId),
        organizationId: String(organizationId || ''),
        packId: pid,
        kind: kind || 'phase1_gate_pending',
        nextPermission,
      },
      actionUrl,
      excludeUserId: actorUserId,
    });
  } catch {
    /* non-blocking */
  }
}

const AI_HITL_ACTION_PATH = 'ai-hitl';

/**
 * AI HITL pack gates — deep-link to ai-hitl workspace.
 */
async function notifyAiHitlGateReviewers({
  projectId,
  organizationId,
  actorUserId,
  packId,
  nextPermission,
  title,
  content,
  kind,
}) {
  if (!projectId || !nextPermission) return;
  await notifyNextGateReviewers({
    projectId,
    organizationId,
    actorUserId,
    nextPermission,
    title,
    content,
    kind: kind || 'ai_hitl_gate_pending',
    actionPath: AI_HITL_ACTION_PATH,
    packId,
  });
}

module.exports = {
  GATE_SOD_ERROR,
  GATE_NOTIFY_PERM_ALIASES,
  isGateSodEnabled,
  projectHasAnalysisTechReviewer,
  projectHasPlanningTechReviewer,
  assertGateStampSoD,
  resolveGateNotifyPermission,
  userIdsWithProjectPermission,
  notifyNextGateReviewers,
  notifyAiHitlGateReviewers,
  AI_HITL_ACTION_PATH,
};
