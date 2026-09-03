const { logger } = require('@enterprise/shared');
const RequirementPack = require('../models/RequirementPack');
const { AI_PLANNING_ALLOWED_STATUSES } = require('../constants/requirementLifecycle');
const {
  assertPackReadyForAiRun,
  attachPlanningReadiness,
} = require('../utils/requirementPlanningReadiness');
const { buildHeuristicOverlay } = require('../utils/aiPlanningHeuristic');
const { buildLeafAssignments } = require('../utils/aiPlanningLeafAssign');
const {
  proposeStaffingFromPack,
  enrichRankingRationales,
} = require('../utils/aiPlanningLlm');
const { ollamaModel } = require('../utils/ollamaClient');
const { buildStaffingBaselineFromPack } = require('../utils/aiPlanningStaffingBaseline');
const {
  validateStaffingProposal,
  deriveStaffingStatus,
  emptyValidation,
  canApproveStaffingProposal,
} = require('../utils/aiPlanningStaffingValidate');
const { buildOrgPoolSummary } = require('../utils/aiPlanningPoolSummary');
const { mergeProposalSkillsForStaffingPlan } = require('../utils/aiPlanningProposalSkills');
const {
  appendStaffingAuditEvent,
  buildAuditEventFromOverlay,
} = require('../utils/aiPlanningStaffingAudit');
const { normalizeAiPlanningPhase } = require('../utils/aiPlanningPhase');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { listOrgResourcePool } = require('./orgResourcePool.service');
const { fetchSkillsByIds, isRegistryEnabled } = require('../clients/skillRegistry.client');

function collectRegistrySkillIds(packObj) {
  const ids = new Set();
  for (const ref of packObj?.requirementSkills || []) {
    if (ref?.skillId) ids.add(String(ref.skillId));
  }
  for (const skill of packObj?.staffingPlan?.requiredSkills || []) {
    if (skill?.skillId) ids.add(String(skill.skillId));
  }
  return [...ids];
}

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);

async function loadPoolForPack({ organizationId, userId, packId }) {
  try {
    return await listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      requirementPackId: String(packId),
      verifiedOnly: true,
      skipCapacityAuth: true,
      forAiPlanning: true,
    });
  } catch (windowErr) {
    if (windowErr.errorCode !== 'PLANNING_WINDOW_INCOMPLETE') throw windowErr;
    logger.warn(
      '[aiPlanning] pack=%s missing planning window — fallback snapshot pool',
      String(packId)
    );
    return listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      verifiedOnly: true,
      skipCapacityAuth: true,
      forAiPlanning: true,
    });
  }
}

async function loadPackForAi({ packId, organizationId }) {
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

  const status = String(pack.status || '');
  if (!ALLOWED_STATUS_SET.has(status)) {
    const err = new Error(
      `Không chạy AI planning ở trạng thái ${status} (cần under_review|approved|project_linked)`
    );
    err.statusCode = 422;
    err.errorCode = 'REQ_AI_STATUS_NOT_ALLOWED';
    err.details = { status };
    throw err;
  }

  return pack;
}

/**
 * Staffing (+ optional enrich when runEnrich=true). Sets aiPlanning.status pending→ready/failed.
 */
async function runStaffingPipeline({ pack, userId, organizationId, packId, runEnrich }) {
  assertPackReadyForAiRun(pack.toObject());

  pack.aiPlanning = {
    status: 'pending',
    overlay: pack.aiPlanning?.overlay || null,
    generatedAt: null,
    sourcePackVersion: pack.versionNumber,
  };
  await pack.save();

  try {
    const packObj = pack.toObject();
    const pool = await loadPoolForPack({
      organizationId,
      userId,
      packId: pack._id,
    });

    const baseline = buildStaffingBaselineFromPack(packObj, { window: pool?.window || null });
    const poolSummary = buildOrgPoolSummary(pool?.items || []);

    let registrySkills = [];
    if (isRegistryEnabled()) {
      registrySkills = await fetchSkillsByIds(organizationId, collectRegistrySkillIds(packObj));
    }

    const llmStaff = await proposeStaffingFromPack(packObj, {
      baseline,
      poolSummary,
      registrySkills,
    });

    let proposalValidation = emptyValidation('skipped');
    let staffingProposalForOverlay = null;

    if (llmStaff.status === 'proposed' && llmStaff.proposal) {
      proposalValidation = validateStaffingProposal({
        proposal: llmStaff.proposal,
        baseline,
        pack: packObj,
        dropped: llmStaff.dropped || [],
      });
      if (proposalValidation.status !== 'rejected') {
        staffingProposalForOverlay = llmStaff.proposal;
      }
    }

    const staffingRoles =
      baseline.fteRoles?.length > 0
        ? baseline.fteRoles
        : (packObj.staffingPlan?.requiredRoles || []).map((r) => ({
            roleKey: String(r.roleKey || '').trim().toLowerCase(),
            requiredCount: Math.max(1, Number(r.requiredCount) || 1),
            leafCount: null,
            roleHours: null,
            source: 'pack_fallback',
          }));

    if (!baseline.fteRoles?.length && staffingRoles.length) {
      logger.warn('[aiPlanning] pack=%s fteRoles empty — fallback staffingPlan roles', String(packId));
    }

    let overlay = buildHeuristicOverlay({
      pack: packObj,
      poolItems: pool?.items || [],
      window: pool?.window || null,
      staffingRoles,
      registrySkills,
    });

    let llmEnrich = {
      status: 'skipped',
      roles: overlay.roles,
      model: ollamaModel(),
      error: llmStaff.status === 'failed' ? 'staffing_failed' : null,
    };

    if (llmStaff.status === 'failed') {
      llmEnrich = {
        status: 'skipped',
        roles: overlay.roles,
        model: ollamaModel(),
        error: 'staffing_failed',
      };
    } else if (runEnrich) {
      llmEnrich = await enrichRankingRationales(overlay.roles, {
        poolItems: pool?.items || [],
      });
      if (llmEnrich.status === 'ready') {
        overlay = { ...overlay, roles: llmEnrich.roles };
      }
    } else {
      llmEnrich = {
        status: 'pending',
        roles: overlay.roles,
        model: ollamaModel(),
        error: null,
      };
    }

    overlay.leafAssignments = buildLeafAssignments({
      pack: packObj,
      poolItems: pool?.items || [],
      registrySkills,
    });

    const previousOverlay =
      pack.aiPlanning?.overlay && typeof pack.aiPlanning.overlay === 'object'
        ? pack.aiPlanning.overlay
        : null;
    const hadAcceptedProposal = Boolean(previousOverlay?.staffingProposalAcceptedAt);

    overlay.baselineStaffing = baseline;
    overlay.proposalValidation = proposalValidation;
    overlay.llm = {
      model: llmStaff.model || llmEnrich.model || ollamaModel(),
      staffingStatus: deriveStaffingStatus(llmStaff, proposalValidation),
      enrichStatus: llmEnrich.status,
      staffingError: llmStaff.error || null,
      enrichError: llmEnrich.error || null,
      dropped: llmStaff.dropped || [],
    };
    overlay.staffingProposal = staffingProposalForOverlay;
    if (staffingProposalForOverlay) {
      overlay.staffingProposalAcceptedAt = null;
    } else if (hadAcceptedProposal) {
      overlay.staffingProposalAcceptedAt = previousOverlay.staffingProposalAcceptedAt;
      if (previousOverlay.staffingProposal?.accepted) {
        overlay.staffingProposal = previousOverlay.staffingProposal;
      }
    }

    pack.aiPlanning = {
      status: 'ready',
      overlay,
      generatedAt: new Date(),
      sourcePackVersion: pack.versionNumber,
    };
    await pack.save();

    return attachPlanningReadiness(pack.toObject());
  } catch (err) {
    logger.error(
      '[aiPlanning] pipeline failed pack=%s org=%s: %s',
      String(packId),
      String(organizationId),
      err.message
    );
    pack.aiPlanning = {
      status: 'failed',
      overlay: {
        engine: 'heuristic_v1',
        errorCode: err.errorCode || 'AI_PLANNING_FAILED',
        message: err.message || 'AI planning failed',
      },
      generatedAt: new Date(),
      sourcePackVersion: pack.versionNumber,
    };
    await pack.save().catch(() => {});

    if (err.statusCode && err.errorCode) throw err;

    const wrap = new Error(err.message || 'AI planning failed');
    wrap.statusCode = err.statusCode || 500;
    wrap.errorCode = err.errorCode || 'AI_PLANNING_FAILED';
    throw wrap;
  }
}

/**
 * Enrich-only: does not flip aiPlanning.status to pending.
 */
async function runEnrichPipeline({ pack, userId, organizationId }) {
  const overlay =
    pack.aiPlanning?.overlay && typeof pack.aiPlanning.overlay === 'object'
      ? pack.aiPlanning.overlay
      : null;
  const roles = Array.isArray(overlay?.roles) ? overlay.roles : null;
  const planningStatus = String(pack.aiPlanning?.status || '');

  if (planningStatus !== 'ready' || !roles) {
    const err = new Error('Cần chạy AI staffing trước khi enrich (status ready + overlay.roles)');
    err.statusCode = 422;
    err.errorCode = 'REQ_AI_ENRICH_NOT_READY';
    err.details = { aiPlanningStatus: planningStatus, hasRoles: Boolean(roles) };
    throw err;
  }

  const prevLlm = overlay.llm && typeof overlay.llm === 'object' ? overlay.llm : {};
  pack.aiPlanning = {
    status: pack.aiPlanning.status || 'ready',
    overlay: {
      ...overlay,
      llm: {
        ...prevLlm,
        enrichStatus: 'pending',
        enrichError: null,
      },
    },
    generatedAt: pack.aiPlanning.generatedAt || new Date(),
    sourcePackVersion: pack.aiPlanning.sourcePackVersion ?? pack.versionNumber,
  };
  await pack.save();

  try {
    const pool = await loadPoolForPack({
      organizationId,
      userId,
      packId: pack._id,
    });

    const llmEnrich = await enrichRankingRationales(roles, {
      poolItems: pool?.items || [],
    });

    const nextOverlay = { ...pack.aiPlanning.overlay };
    if (llmEnrich.status === 'ready') {
      nextOverlay.roles = llmEnrich.roles;
    }
    nextOverlay.llm = {
      ...(nextOverlay.llm || {}),
      model: llmEnrich.model || nextOverlay.llm?.model || ollamaModel(),
      enrichStatus: llmEnrich.status === 'ready' ? 'ready' : llmEnrich.status || 'failed',
      enrichError: llmEnrich.error || null,
    };

    pack.aiPlanning = {
      status: 'ready',
      overlay: nextOverlay,
      generatedAt: pack.aiPlanning.generatedAt || new Date(),
      sourcePackVersion: pack.aiPlanning.sourcePackVersion ?? pack.versionNumber,
    };
    await pack.save();
    return attachPlanningReadiness(pack.toObject());
  } catch (err) {
    logger.error(
      '[aiPlanning] enrich failed pack=%s org=%s: %s',
      String(pack._id),
      String(organizationId),
      err.message
    );
    const failedOverlay = {
      ...(pack.aiPlanning?.overlay && typeof pack.aiPlanning.overlay === 'object'
        ? pack.aiPlanning.overlay
        : overlay),
    };
    failedOverlay.llm = {
      ...(failedOverlay.llm || {}),
      enrichStatus: 'failed',
      enrichError: err.errorCode || err.message || 'enrich_failed',
    };
    pack.aiPlanning = {
      status: 'ready',
      overlay: failedOverlay,
      generatedAt: pack.aiPlanning?.generatedAt || new Date(),
      sourcePackVersion: pack.aiPlanning?.sourcePackVersion ?? pack.versionNumber,
    };
    await pack.save().catch(() => {});

    if (err.statusCode && err.errorCode) throw err;

    const wrap = new Error(err.message || 'AI enrich failed');
    wrap.statusCode = err.statusCode || 500;
    wrap.errorCode = err.errorCode || 'AI_PLANNING_ENRICH_FAILED';
    throw wrap;
  }
}

/**
 * Pipeline by phase: staffing | enrich | full (default).
 * Does not mutate staffingPlan until approveStaffingProposal.
 */
async function runAiPlanningHeuristic({ userId, organizationId, packId, phase: phaseRaw } = {}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const phase = normalizeAiPlanningPhase(phaseRaw);
  const pack = await loadPackForAi({ packId, organizationId });

  if (phase === 'enrich') {
    return runEnrichPipeline({ pack, userId, organizationId });
  }

  return runStaffingPipeline({
    pack,
    userId,
    organizationId,
    packId,
    runEnrich: phase === 'full',
  });
}

/**
 * Human approve: merge overlay.staffingProposal → staffingPlan (source ai).
 * Does not assign project members.
 */
async function approveStaffingProposal({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
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

  const overlay = pack.aiPlanning?.overlay;
  const proposal = overlay?.staffingProposal;
  if (!canApproveStaffingProposal(overlay)) {
    if (overlay?.proposalValidation?.status === 'rejected') {
      const err = new Error('Staffing proposal không hợp lệ (semantic validation rejected)');
      err.statusCode = 422;
      err.errorCode = 'REQ_AI_STAFFING_PROPOSAL_REJECTED';
      throw err;
    }
    const err = new Error('Không có staffing proposal từ AI để duyệt');
    err.statusCode = 422;
    err.errorCode = 'REQ_AI_STAFFING_PROPOSAL_MISSING';
    throw err;
  }
  if (overlay.staffingProposalAcceptedAt) {
    const err = new Error('Staffing proposal đã được duyệt trước đó');
    err.statusCode = 409;
    err.errorCode = 'REQ_AI_STAFFING_ALREADY_ACCEPTED';
    throw err;
  }

  const packObj = pack.toObject();
  let registrySkills = [];
  if (isRegistryEnabled()) {
    registrySkills = await fetchSkillsByIds(organizationId, collectRegistrySkillIds(packObj));
  }

  const requiredSkills = mergeProposalSkillsForStaffingPlan({
    proposalSkills: proposal.requiredSkills || [],
    packRequirementSkills: packObj.requirementSkills || [],
    baselineRollupSkills: overlay.baselineStaffing?.rollup?.requiredSkills || [],
    registrySkills,
  });

  const requiredRoles = (proposal.requiredRoles || [])
    .map((r) => ({
      roleKey: String(r.roleKey || '')
        .trim()
        .toLowerCase(),
      requiredCount: Math.max(1, Number(r.requiredCount) || 1),
      source: 'ai',
    }))
    .filter((r) => r.roleKey);

  pack.staffingPlan = {
    requiredSkills,
    requiredRoles,
    estimatedHoursTotal:
      proposal.estimatedHoursTotal != null && Number.isFinite(Number(proposal.estimatedHoursTotal))
        ? Number(proposal.estimatedHoursTotal)
        : pack.staffingPlan?.estimatedHoursTotal ?? null,
    startDate: pack.staffingPlan?.startDate || pack.overview?.startDate || null,
    budgetCurrency: pack.staffingPlan?.budgetCurrency || pack.overview?.budgetCurrency || '',
  };
  pack.versionNumber = Math.max(1, Number(pack.versionNumber) || 1) + 1;

  const nextOverlay = appendStaffingAuditEvent(
    {
      ...(overlay && typeof overlay === 'object' ? overlay : {}),
      staffingProposalAcceptedAt: new Date().toISOString(),
      staffingProposal: {
        ...proposal,
        accepted: true,
      },
    },
    buildAuditEventFromOverlay(overlay, { action: 'approved', userId })
  );
  pack.aiPlanning = {
    status: pack.aiPlanning?.status || 'ready',
    overlay: nextOverlay,
    generatedAt: pack.aiPlanning?.generatedAt || new Date(),
    sourcePackVersion: pack.versionNumber,
  };

  await pack.save();
  return attachPlanningReadiness(pack.toObject());
}

/**
 * Discard pending AI staffing proposal without mutating staffingPlan.
 */
async function discardStaffingProposal({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
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

  const overlay = pack.aiPlanning?.overlay;
  if (!overlay?.staffingProposal) {
    const err = new Error('Không có staffing proposal để hủy');
    err.statusCode = 422;
    err.errorCode = 'REQ_AI_STAFFING_PROPOSAL_MISSING';
    throw err;
  }

  const overlayWithAudit = appendStaffingAuditEvent(
    overlay,
    buildAuditEventFromOverlay(overlay, { action: 'discarded', userId })
  );

  pack.aiPlanning = {
    status: pack.aiPlanning?.status || 'ready',
    overlay: {
      ...overlayWithAudit,
      staffingProposal: null,
      staffingProposalAcceptedAt: null,
      llm: {
        ...(overlayWithAudit.llm || {}),
        staffingStatus: 'discarded',
      },
    },
    generatedAt: pack.aiPlanning?.generatedAt || new Date(),
    sourcePackVersion: pack.aiPlanning?.sourcePackVersion ?? pack.versionNumber,
  };
  await pack.save();
  return attachPlanningReadiness(pack.toObject());
}

module.exports = {
  normalizeAiPlanningPhase,
  runAiPlanningHeuristic,
  runAiPlanning: runAiPlanningHeuristic,
  approveStaffingProposal,
  discardStaffingProposal,
};
