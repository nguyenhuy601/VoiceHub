/**
 * Gate 2 promote: seed Phase 1 RA → seed Phase 2 board → development + P3/P4 skeleton.
 */

const Project = require('../models/Project');
const RequirementPack = require('../models/RequirementPack');
const { logger } = require('@enterprise/shared');
const {
  assertGate2ProjectPlanConfirmed,
} = require('../utils/tools/assertGate2ProjectPlanConfirmed');
const { assertRequirementPermission } = require('./requirementAccess.service');
const {
  importRequirementPackWorkItems,
  seedProjectMembersFromAssignees,
} = require('./requirementPackWorkImport.service');
const { normalizeCreatePackLeafAssignments } = require('../utils/requirement/requirementPackWorkImport.utils');
const { seedPhase34FromPlan } = require('./seedPhase34FromPlan.service');
const { attachPlanningReadiness } = require('../utils/requirement/requirementPlanningReadiness');
const { isPhaseHowConfirmed } = require('../utils/aiAnalysis/phaseGate2');

/**
 * Org create-project OR Gate2 PO (planning:po_review) when HOW already confirmed.
 * Avoids false 403 for Product Owner who may activate delivery after Gate2.
 */
async function assertMayPromoteGate2Pack({
  userId,
  organizationId,
  pack,
  skipCreateProjectPermission = false,
} = {}) {
  if (skipCreateProjectPermission) return { via: 'trusted_gate2_po_approve' };

  try {
    await assertRequirementPermission({
      userId,
      organizationId,
      permission: 'requirement:create-project',
    });
    return { via: 'requirement:create-project' };
  } catch (createErr) {
    if (Number(createErr?.statusCode) !== 403) throw createErr;

    const projectId = pack?.projectId ? String(pack.projectId) : '';
    if (!projectId || !isPhaseHowConfirmed(pack?.aiAnalysis || pack)) {
      throw createErr;
    }

    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const { hasPermission } = require('../utils/project/projectPermissionMatrix');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    const bypass = resolved.isOrgAdmin || resolved.isCreator;
    if (bypass || hasPermission(resolved.permissions, 'planning:po_review')) {
      return { via: 'planning:po_review' };
    }
    throw createErr;
  }
}

async function promoteProjectFromGate2({
  userId,
  organizationId,
  packId,
  importWorkItems = true,
  applyAssignees = true,
  leafAssignments = [],
  taskIds = null,
  idempotencyKey = null,
  forceApprove = false,
  overrideReason = '',
  /** When true — caller already passed Gate2 PO authz (planning:po_review). */
  skipCreateProjectPermission = false,
} = {}) {
  const pack = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  });
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  await assertMayPromoteGate2Pack({
    userId,
    organizationId,
    pack,
    skipCreateProjectPermission,
  });
  if (pack.status !== 'approved' && pack.status !== 'project_linked') {
    const err = new Error('Pack phải approved (Gate 1) trước khi promote');
    err.statusCode = 409;
    err.errorCode = 'REQ_INVALID_STATUS_TRANSITION';
    throw err;
  }

  assertGate2ProjectPlanConfirmed(pack.toObject ? pack.toObject() : pack);

  const {
    assertGate2FeasibilityOrOverride,
  } = require('../utils/tools/assertGate2FeasibilityOrOverride');
  const g13Gate = assertGate2FeasibilityOrOverride({
    pack: pack.toObject ? pack.toObject() : pack,
    forceApprove,
    overrideReason,
  });
  if (g13Gate.override) {
    const shell =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
    shell.gate2Override = {
      forceApprove: true,
      reason: g13Gate.override.reason,
      missingFeasibility: Boolean(g13Gate.override.missingFeasibility),
      failures: g13Gate.override.failures || null,
      by: userId,
      at: new Date().toISOString(),
    };
    pack.aiAnalysis = shell;
    pack.markModified('aiAnalysis');
    logger.warn('[requirement] Gate2 G13 forceApprove', {
      packId: String(packId),
      userId: String(userId),
      missingFeasibility: g13Gate.override.missingFeasibility,
      reasonLen: String(g13Gate.override.reason || '').length,
    });
    await pack.save();
  }

  const projectId = pack.projectId ? String(pack.projectId) : '';
  if (!projectId) {
    const err = new Error('Pack chưa gắn Project draft — dùng create-project legacy');
    err.statusCode = 409;
    err.errorCode = 'REQ_PACK_NO_DRAFT_PROJECT';
    throw err;
  }

  const project = await Project.findOne({
    _id: projectId,
    organizationId,
    isArchived: { $ne: true },
  });
  if (!project) {
    const err = new Error('Project draft không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const key = String(idempotencyKey || '').trim();
  const priorPromote =
    pack.aiAnalysis && typeof pack.aiAnalysis === 'object'
      ? pack.aiAnalysis.gate2Promote
      : null;
  if (
    key &&
    priorPromote &&
    String(priorPromote.idempotencyKey || '') === key &&
    project.status === 'in_development'
  ) {
    return {
      pack: attachPlanningReadiness(pack.toObject()),
      project: project.toObject(),
      importStats: priorPromote.importStats || null,
      phase34: priorPromote.phase34 || null,
      analysisSeed: priorPromote.analysisSeed || null,
      promoted: true,
      idempotentReplay: true,
      linkedDocumentCount: priorPromote.linkedDocumentCount ?? 0,
    };
  }

  const boardId =
    project.defaultBoardId ||
    null;
  let resolvedBoardId = boardId ? String(boardId) : '';
  if (!resolvedBoardId) {
    const TaskBoard = require('../models/TaskBoard');
    const fallbackBoard = await TaskBoard.findOne({
      projectId: project._id,
      isActive: { $ne: false },
    })
      .select('_id')
      .sort({ createdAt: 1 })
      .lean();
    if (fallbackBoard?._id) {
      resolvedBoardId = String(fallbackBoard._id);
      project.defaultBoardId = fallbackBoard._id;
      await project.save();
      logger.info(
        '[promote] healed defaultBoardId project=%s board=%s',
        projectId,
        resolvedBoardId
      );
    }
  }

  const normalizedLeafAssignments = normalizeCreatePackLeafAssignments(leafAssignments);

  // 1) Seed Phase 1 RA artifacts + link customer docs.
  let analysisSeed = null;
  try {
    const { seedArtifactsFromRequirementPack, linkPackDocumentsToProject } = require('./analysis.service');
    analysisSeed = await seedArtifactsFromRequirementPack({
      userId,
      projectId,
      pack: pack.toObject(),
    });
    const linkedDocs = await linkPackDocumentsToProject({
      organizationId,
      packId,
      projectId,
    });
    analysisSeed = {
      ...(analysisSeed && typeof analysisSeed === 'object' ? analysisSeed : {}),
      linkedDocumentCount: linkedDocs.modified,
    };
  } catch (seedErr) {
    logger.warn(
      '[promote] analysis seed failed project=%s: %s',
      projectId,
      seedErr?.message || seedErr
    );
  }

  // 2) Seed Phase 2 board tasks + members from Blueprint.
  let importStats = null;
  if (importWorkItems) {
    if (!resolvedBoardId) {
      const err = new Error('Project chưa có board mặc định để import work items');
      err.statusCode = 409;
      err.errorCode = 'PROMOTE_BOARD_REQUIRED';
      throw err;
    }
    importStats = await importRequirementPackWorkItems({
      userId,
      organizationId,
      pack: pack.toObject(),
      project: project.toObject ? project.toObject() : project,
      boardId: resolvedBoardId,
      leafAssignments: normalizedLeafAssignments,
      applyAssignees,
      taskIds,
    });
    await seedProjectMembersFromAssignees({
      userId,
      projectId,
      boardId: resolvedBoardId,
      pack: pack.toObject(),
      leafAssignments: normalizedLeafAssignments,
    });
  }

  // 3) Promote lifecycle → Phase 2 hub (development).
  project.status = 'in_development';
  project.deliveryPhase = 'development';
  await project.save();

  if (pack.status === 'approved') {
    pack.status = 'project_linked';
    await pack.save();
  }

  // 4) P3/P4 skeleton (non-blocking).
  let phase34 = null;
  try {
    phase34 = await seedPhase34FromPlan({
      organizationId,
      projectId,
      userId,
    });
  } catch (seedErr) {
    logger.warn(
      '[promote] phase34 seed failed project=%s: %s',
      projectId,
      seedErr?.message || seedErr
    );
  }

  if (key) {
    const container =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? pack.aiAnalysis : {};
    container.gate2Promote = {
      idempotencyKey: key,
      promotedAt: new Date().toISOString(),
      projectId,
      importStats: importStats || null,
      phase34: phase34 || null,
      analysisSeed: analysisSeed || null,
      linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  } else {
    // Always stamp promote meta for Gate2 auto-promote observability
    const container =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
    container.gate2Promote = {
      ...(container.gate2Promote && typeof container.gate2Promote === 'object'
        ? container.gate2Promote
        : {}),
      promotedAt: new Date().toISOString(),
      projectId,
      importStats: importStats || null,
      phase34: phase34 || null,
      analysisSeed: analysisSeed || null,
      linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
      source: 'gate2_po_approve',
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  }

  return {
    pack: attachPlanningReadiness(pack.toObject()),
    project: project.toObject(),
    importStats,
    phase34,
    analysisSeed,
    promoted: true,
    idempotentReplay: false,
    linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
  };
}

/**
 * After Gate2 PO approve — seed board + deliveryPhase=development (atomic with confirm).
 * Prefer draft project promote; legacy pack without projectId uses create-from-pack.
 */
async function autoPromoteAfterGate2PoApprove({
  userId,
  organizationId,
  packId,
  forceApprove = false,
  overrideReason = '',
} = {}) {
  const pack = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  }).lean();
  if (!pack) {
    const err = new Error('Requirement pack không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const promoteArgs = {
    userId,
    organizationId,
    packId,
    importWorkItems: true,
    applyAssignees: true,
    forceApprove,
    overrideReason,
    skipCreateProjectPermission: true,
    idempotencyKey: `gate2-po-approve:${String(packId)}`,
  };

  if (pack.projectId) {
    return promoteProjectFromGate2(promoteArgs);
  }

  const { createProjectFromRequirementPack } = require('./requirementPack.service');
  return createProjectFromRequirementPack({
    ...promoteArgs,
    skipCreateProjectPermission: true,
  });
}

module.exports = {
  promoteProjectFromGate2,
  autoPromoteAfterGate2PoApprove,
  assertMayPromoteGate2Pack,
};
