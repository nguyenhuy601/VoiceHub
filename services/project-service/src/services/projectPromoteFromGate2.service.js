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
    const bypass = false;
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
    logger.warn('[requirement] Gate2 feasibility forceApprove', {
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
      logger.info('[promote] healed defaultBoardId', {
        projectId: String(projectId),
        boardId: resolvedBoardId,
      });
    }
  }

  const normalizedLeafAssignments = normalizeCreatePackLeafAssignments(leafAssignments);

  // 1) Seed Phase 1 RA artifacts + link customer docs (independent soft-fail).
  let analysisSeed = null;
  {
    const { seedArtifactsFromRequirementPack, linkPackDocumentsToProject } = require('./analysis.service');
    try {
      analysisSeed = await seedArtifactsFromRequirementPack({
        userId,
        projectId,
        pack: pack.toObject(),
      });
    } catch (seedErr) {
      logger.warn('[promote] analysis seed failed', {
        projectId: String(projectId),
        message: String(seedErr?.message || seedErr),
        errorCode: seedErr?.errorCode || undefined,
      });
    }
    try {
      const linkedDocs = await linkPackDocumentsToProject({
        organizationId,
        packId,
        projectId,
      });
      analysisSeed = {
        ...(analysisSeed && typeof analysisSeed === 'object' ? analysisSeed : {}),
        linkedDocumentCount: linkedDocs.modified,
      };
    } catch (linkErr) {
      logger.warn('[promote] link pack documents failed', {
        projectId: String(projectId),
        packId: String(packId),
        message: String(linkErr?.message || linkErr),
      });
      analysisSeed = {
        ...(analysisSeed && typeof analysisSeed === 'object' ? analysisSeed : {}),
        linkedDocumentCount: 0,
      };
    }
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
    try {
      const { recomputeForecastForUsers } = require('./forecastCapacity.service');
      const packAi = pack.toObject ? pack.toObject() : pack;
      const assignUserIds = [
        ...new Set(
          (normalizedLeafAssignments || [])
            .map((a) => String(a?.userId || a?.assigneeUserId || '').trim())
            .filter(Boolean)
        ),
      ];
      const fromContainer = Array.isArray(packAi?.aiAnalysis?.resource?.assignments)
        ? packAi.aiAnalysis.resource.assignments
            .map((a) => String(a?.userId || '').trim())
            .filter(Boolean)
        : [];
      const userIds = [...new Set([...assignUserIds, ...fromContainer])];
      if (userIds.length) {
        await recomputeForecastForUsers({ organizationId, userIds });
      }
    } catch {
      /* best-effort forecast recompute */
    }
  }

  // 3) Sprint planned + DEPENDENCY/RISK PlanningArtifacts (soft-fail).
  let howMaterialize = null;
  try {
    const { materializeGate2HowArtifacts } = require('./gate2PromoteMaterialize.service');
    howMaterialize = await materializeGate2HowArtifacts({
      userId,
      organizationId,
      projectId,
      boardId: resolvedBoardId || null,
      packId,
      pack: pack.toObject ? pack.toObject() : pack,
      importStats,
    });
  } catch (matErr) {
    logger.warn('[promote] gate2 how materialize failed', {
      projectId: String(projectId),
      message: String(matErr?.message || matErr),
      errorCode: matErr?.errorCode || undefined,
    });
    howMaterialize = {
      error: String(matErr?.message || matErr),
      sprintsCreated: 0,
      dependenciesSeeded: 0,
      risksSeeded: 0,
    };
  }

  // 4) Promote lifecycle → Phase 2 hub (development).
  project.status = 'in_development';
  project.deliveryPhase = 'development';
  await project.save();

  if (pack.status === 'approved') {
    pack.status = 'project_linked';
    await pack.save();
  }

  // 5) P3/P4 skeleton (non-blocking).
  let phase34 = null;
  try {
    const rawPhase34 = await seedPhase34FromPlan({
      organizationId,
      projectId,
      userId,
      pack: pack.toObject ? pack.toObject() : pack,
      blueprintIdMap: importStats?.blueprintIdMap || null,
    });
    const tc = rawPhase34?.testCases || {};
    phase34 = {
      created: tc.created || 0,
      skipped: tc.skipped || 0,
      skippedIncomplete: tc.skippedIncomplete || 0,
      linkedWorkItems: tc.linkedWorkItems || 0,
      source: tc.source || null,
      handoverUpdated: Boolean(rawPhase34?.handover?.updated),
      catalog: tc.catalog || null,
      tasks: tc.tasks || null,
    };
    logger.info('[promote] phase34 seed ok', {
      projectId: String(projectId),
      created: phase34.created,
      skipped: phase34.skipped,
      skippedIncomplete: phase34.skippedIncomplete,
      linkedWorkItems: phase34.linkedWorkItems,
      source: phase34.source,
    });
  } catch (seedErr) {
    logger.warn('[promote] phase34 seed failed', {
      projectId: String(projectId),
      message: String(seedErr?.message || seedErr),
      errorCode: seedErr?.errorCode || undefined,
    });
  }

  let importStatsStamp = null;
  if (importStats && typeof importStats === 'object') {
    const { blueprintIdMap: _bpMap, ...importRest } = importStats;
    importStatsStamp = {
      ...importRest,
      blueprintIdMapSize: _bpMap ? Object.keys(_bpMap).length : 0,
    };
  }

  const promoteMetaBase = {
    promotedAt: new Date().toISOString(),
    projectId,
    importStats: importStatsStamp,
    phase34: phase34 || null,
    analysisSeed: analysisSeed || null,
    linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
    howMaterialize: howMaterialize
      ? {
          sprintsCreated: howMaterialize.sprintsCreated || 0,
          sprintsSkipped: howMaterialize.sprintsSkipped || 0,
          tasksSprintLinked: howMaterialize.tasksSprintLinked || 0,
          dependenciesSeeded: howMaterialize.dependenciesSeeded || 0,
          dependenciesSkipped: howMaterialize.dependenciesSkipped || 0,
          risksSeeded: howMaterialize.risksSeeded || 0,
          risksSkipped: howMaterialize.risksSkipped || 0,
          warnings: Array.isArray(howMaterialize.warnings)
            ? howMaterialize.warnings.slice(0, 30)
            : [],
          error: howMaterialize.error || undefined,
        }
      : null,
  };

  if (key) {
    const container =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? pack.aiAnalysis : {};
    container.gate2Promote = {
      ...promoteMetaBase,
      idempotencyKey: key,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  } else {
    const container =
      pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
    container.gate2Promote = {
      ...(container.gate2Promote && typeof container.gate2Promote === 'object'
        ? container.gate2Promote
        : {}),
      ...promoteMetaBase,
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
    howMaterialize,
    promoted: true,
    idempotentReplay: false,
    linkedDocumentCount: analysisSeed?.linkedDocumentCount ?? 0,
  };
}

/**
 * Legacy helper — no longer called from confirmAiAnalysisJob (approve ≠ promote).
 * Prefer POST create-project with idempotencyKey `gate2-phase2:{packId}`.
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
    idempotencyKey: `gate2-phase2:${String(packId)}`,
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
