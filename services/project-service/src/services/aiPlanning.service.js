const { logger } = require('@enterprise/shared');
const RequirementPack = require('../models/RequirementPack');
const { AI_PLANNING_ALLOWED_STATUSES } = require('../constants/requirementLifecycle');
const {
  assertPackReadyForAiRun,
  attachPlanningReadiness,
} = require('../utils/requirementPlanningReadiness');
const { buildHeuristicOverlay } = require('../utils/aiPlanningHeuristic');
const { assertRequirementPermission } = require('./requirementAccess.service');
const { listOrgResourcePool } = require('./orgResourcePool.service');

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);

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
    let pool;
    try {
      pool = await listOrgResourcePool({
        organizationId,
        actorUserId: userId,
        requirementPackId: String(pack._id),
        verifiedOnly: true,
        skipCapacityAuth: true,
      });
    } catch (windowErr) {
      if (windowErr.errorCode !== 'PLANNING_WINDOW_INCOMPLETE') throw windowErr;
      logger.warn(
        '[aiPlanning] pack=%s missing planning window — fallback snapshot pool',
        String(packId)
      );
      pool = await listOrgResourcePool({
        organizationId,
        actorUserId: userId,
        verifiedOnly: true,
        skipCapacityAuth: true,
      });
    }

    const overlay = buildHeuristicOverlay({
      pack: pack.toObject(),
      poolItems: pool?.items || [],
      window: pool?.window || null,
    });

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
      '[aiPlanning] heuristic failed pack=%s org=%s: %s',
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

module.exports = {
  runAiPlanningHeuristic,
};
