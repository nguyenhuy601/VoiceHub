/**
 * Gate 2 promote: draft Project → active + seed P2 (Blueprint) + P3/P4 skeleton.
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
} = {}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:create-project',
  });

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
    project.status === 'active'
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

  const boardId = project.defaultBoardId || null;
  const normalizedLeafAssignments = normalizeCreatePackLeafAssignments(leafAssignments);

  let importStats = null;
  if (importWorkItems) {
    importStats = await importRequirementPackWorkItems({
      userId,
      organizationId,
      pack: pack.toObject(),
      project: project.toObject ? project.toObject() : project,
      boardId,
      leafAssignments: normalizedLeafAssignments,
      applyAssignees,
      taskIds,
    });
    await seedProjectMembersFromAssignees({
      userId,
      projectId,
      boardId,
      pack: pack.toObject(),
      leafAssignments: normalizedLeafAssignments,
    });
  }

  // Promote lifecycle + delivery phase (development = Phase 2 hub).
  project.status = 'active';
  project.deliveryPhase = 'development';
  await project.save();

  if (pack.status === 'approved') {
    pack.status = 'project_linked';
    await pack.save();
  }

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

module.exports = {
  promoteProjectFromGate2,
};
