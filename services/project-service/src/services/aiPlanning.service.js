const { logger } = require('@enterprise/shared');
const RequirementPack = require('../models/RequirementPack');
const { AI_PLANNING_ALLOWED_STATUSES } = require('../constants/requirementLifecycle');
const {
  assertPackReadyForAiRun,
  attachPlanningReadiness,
} = require('../utils/requirementPlanningReadiness');
const { buildHeuristicOverlay } = require('../utils/aiPlanningHeuristic');
const {
  proposeStaffingFromPack,
  enrichRankingRationales,
} = require('../utils/aiPlanningLlm');
const { ollamaModel } = require('../utils/ollamaClient');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { listOrgResourcePool } = require('./orgResourcePool.service');

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);

async function loadPoolForPack({ organizationId, userId, packId }) {
  try {
    return await listOrgResourcePool({
      organizationId,
      actorUserId: userId,
      requirementPackId: String(packId),
      verifiedOnly: true,
      skipCapacityAuth: true,
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
    });
  }
}

/**
 * Pipeline: LLM staffing proposal → heuristic engine → LLM enrich → overlay.
 * Does not mutate staffingPlan until approveStaffingProposal.
 */
async function runAiPlanningHeuristic({ userId, organizationId, packId }) {
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

    const llmStaff = await proposeStaffingFromPack(packObj);
    const staffingOverride =
      llmStaff.status === 'proposed' && llmStaff.proposal ? llmStaff.proposal : null;

    let overlay = buildHeuristicOverlay({
      pack: packObj,
      poolItems: pool?.items || [],
      window: pool?.window || null,
      staffingOverride,
    });

    const llmEnrich = await enrichRankingRationales(overlay.roles);
    if (llmEnrich.status === 'ready') {
      overlay = { ...overlay, roles: llmEnrich.roles };
    }

    overlay.llm = {
      model: llmStaff.model || llmEnrich.model || ollamaModel(),
      staffingStatus: llmStaff.status,
      enrichStatus: llmEnrich.status,
      staffingError: llmStaff.error || null,
      enrichError: llmEnrich.error || null,
      dropped: llmStaff.dropped || [],
    };
    overlay.staffingProposal =
      llmStaff.status === 'proposed' ? llmStaff.proposal : null;
    if (overlay.staffingProposal) {
      overlay.staffingProposalAcceptedAt = null;
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
  if (!proposal || typeof proposal !== 'object') {
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

  const requiredSkills = (proposal.requiredSkills || []).map((s) => ({
    name: String(s.name || s).trim(),
    source: 'ai',
  })).filter((s) => s.name);

  const requiredRoles = (proposal.requiredRoles || []).map((r) => ({
    roleKey: String(r.roleKey || '')
      .trim()
      .toLowerCase(),
    requiredCount: Math.max(1, Number(r.requiredCount) || 1),
    source: 'ai',
  })).filter((r) => r.roleKey);

  pack.staffingPlan = {
    requiredSkills,
    requiredRoles,
    estimatedHoursTotal:
      proposal.estimatedHoursTotal != null && Number.isFinite(Number(proposal.estimatedHoursTotal))
        ? Number(proposal.estimatedHoursTotal)
        : pack.staffingPlan?.estimatedHoursTotal ?? null,
    startDate: pack.staffingPlan?.startDate || pack.overview?.startDate || null,
    budgetCurrency:
      pack.staffingPlan?.budgetCurrency || pack.overview?.budgetCurrency || '',
  };
  pack.versionNumber = Math.max(1, Number(pack.versionNumber) || 1) + 1;

  const nextOverlay = {
    ...(overlay && typeof overlay === 'object' ? overlay : {}),
    staffingProposalAcceptedAt: new Date().toISOString(),
    staffingProposal: {
      ...proposal,
      accepted: true,
    },
  };
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

  pack.aiPlanning = {
    status: pack.aiPlanning?.status || 'ready',
    overlay: {
      ...overlay,
      staffingProposal: null,
      staffingProposalAcceptedAt: null,
      llm: {
        ...(overlay.llm || {}),
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
  runAiPlanningHeuristic,
  runAiPlanning: runAiPlanningHeuristic,
  approveStaffingProposal,
  discardStaffingProposal,
};
