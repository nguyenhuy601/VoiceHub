/**
 * AI Analysis job orchestration (schema v2) — 11 user jobs + gates.
 */

const RequirementPack = require('../models/RequirementPack');
const { AI_PLANNING_ALLOWED_STATUSES } = require('../constants/requirementLifecycle');
const { assertPackReadyForAiAnalysis } = require('../utils/requirement/requirementPlanningReadiness');
const {
  createEmptyAiAnalysisContainer,
  ensureAiAnalysisContainer,
  assertSchemaVersionPresent,
  assertPreviousJobConfirmed,
  assertJobNotConfirmedForRerun,
  summarizeAiAnalysis,
  buildWizardJobDto,
  markJobReadyStub,
  markJobConfirmed,
  markJobsStaleAfter,
  applyJobEdits,
  getJobStatus,
  assertCapabilityConfirmable,
} = require('../utils/aiAnalysis/aiAnalysisContainer');
const { parseJobId } = require('../constants/aiAnalysisJobs.constants');
const {
  resolveJobWallMs,
  remainingWallMs,
} = require('../utils/aiAnalysis/aiAnalysisJobBudgets');
const { ensureHierarchyDecompositionMigrated } = require('../utils/aiAnalysis/aiAnalysisMigrateJobs');
const { warmOllamaModelSession } = require('../utils/aiAnalysis/ollamaClient');
const { compactSessionWarmTtlMs } = require('../utils/aiAnalysis/aiAnalysisCompactPolicy');
const {
  isCompactV2Enabled,
  runCompactRequirementAnalysis,
  runCompactCapabilityAnalysis,
  runCompactWbsGeneration,
  runCompactDependencyAnalysis,
  runCompactArchitectureRiskAnalysis,
} = require('../utils/aiAnalysis/aiAnalysisCompactOrchestrator');
const { buildAiAnalysisSheet11Buffer } = require('../utils/aiAnalysis/aiAnalysisSheet11Export');
const {
  runCapabilityAnalysis,
  applyCapabilityToContainer,
} = require('../utils/aiAnalysis/aiAnalysisCapability');
const {
  runDataAnalysis,
  applyDataToContainer,
} = require('../utils/aiAnalysis/aiAnalysisData');
const {
  runDependencyAnalysis,
  applyDependencyToContainer,
} = require('../utils/aiAnalysis/aiAnalysisDependency');
const {
  runArchitectureImpactAnalysis,
  applyArchitectureImpactToContainer,
} = require('../utils/aiAnalysis/aiAnalysisArchitectureImpact');
const {
  runRiskAnalysis,
  applyRiskToContainer,
} = require('../utils/aiAnalysis/aiAnalysisRisk');
const {
  runGapAnalysis,
  applyGapToContainer,
} = require('../utils/aiAnalysis/aiAnalysisGap');
const {
  runWbsTaskGeneration,
  applyWbsToContainer,
  applyDependencyOrderHint,
} = require('../utils/aiAnalysis/aiAnalysisWbs');
const {
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
} = require('../utils/aiAnalysis/aiAnalysisRoleSkill');
const {
  runEffortEngine,
  applyEffortToContainer,
} = require('../utils/aiAnalysis/aiAnalysisEffort');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../utils/aiAnalysis/aiAnalysisMatching');
const {
  validateAssignmentsAgainstShortlist,
} = require('../utils/aiAnalysis/aiAnalysisAssignment');
const {
  runSequencingCpm,
  applySequencingCpmToContainer,
} = require('../utils/aiAnalysis/aiAnalysisSequencingCpm');
const {
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
  buildExecutionPlanFromContainer,
  applyProjectPlanToContainer,
} = require('../utils/aiAnalysis/aiAnalysisScheduleCapacity');
const {
  runHierarchyDecomposition,
  applyHierarchyToContainer,
} = require('../utils/aiAnalysis/aiAnalysisHierarchy');
const {
  mergeHierarchyProposalsIntoFrList,
} = require('../utils/aiAnalysis/aiAnalysisHierarchyMerge');
const { assertRequirementPermission } = require('./requirementAccess.service');
const {
  failStalePendingAiAnalysisJobs,
  shouldSkipRerunBecauseReady,
} = require('../utils/aiAnalysis/aiAnalysisStaleGc');

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);

async function loadPackForAiAnalysis({ packId, organizationId }) {
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
  return pack;
}

function assertPackStatusAllowsAi(pack) {
  const status = String(pack.status || '');
  if (!ALLOWED_STATUS_SET.has(status)) {
    const err = new Error(
      `Không chạy AI Analysis ở trạng thái ${status} (cần under_review|approved|project_linked)`
    );
    err.statusCode = 422;
    err.errorCode = 'AI_ANALYSIS_STATUS_NOT_ALLOWED';
    err.details = { status };
    throw err;
  }
}

function ensurePackContainer(pack) {
  const raw = pack.aiAnalysis;
  const rawCapStatus =
    raw && typeof raw === 'object'
      ? String(raw.jobs?.capabilityAnalysis?.status || '')
      : '';
  const jobWasMissing =
    !raw ||
    typeof raw !== 'object' ||
    !raw.jobs ||
    typeof raw.jobs !== 'object' ||
    !Object.prototype.hasOwnProperty.call(raw.jobs, 'hierarchyDecomposition');

  if (!raw || typeof raw !== 'object') {
    pack.aiAnalysis = createEmptyAiAnalysisContainer();
  } else {
    pack.aiAnalysis = ensureAiAnalysisContainer(pack.aiAnalysis);
  }

  if (
    rawCapStatus === 'ready' &&
    getJobStatus(pack.aiAnalysis, 'capabilityAnalysis') === 'stale'
  ) {
    pack.markModified('aiAnalysis');
  }

  const migrated = ensureHierarchyDecompositionMigrated(
    pack.aiAnalysis,
    pack.functionalRequirements,
    { jobWasMissing }
  );
  if (migrated.changed) {
    pack.aiAnalysis = migrated.container;
    pack.markModified('aiAnalysis');
  }

  assertSchemaVersionPresent(pack.aiAnalysis);
  return pack.aiAnalysis;
}

function beginJobPending(pack, container, job) {
  pack.aiAnalysisStatus = 'pending';
  let next = markJobReadyStub(container, job);
  next.jobs[job] = {
    ...next.jobs[job],
    status: 'pending',
    error: null,
  };
  pack.aiAnalysis = next;
  pack.markModified('aiAnalysis');
  return next;
}

async function getAiAnalysisSummary({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  const rawCapStatus = String(pack.aiAnalysis?.jobs?.capabilityAnalysis?.status || '');
  let container = ensureAiAnalysisContainer(pack.aiAnalysis);
  let needsSave =
    rawCapStatus === 'ready' && getJobStatus(container, 'capabilityAnalysis') === 'stale';
  const gc = failStalePendingAiAnalysisJobs(container);
  if (gc.changed) {
    container = gc.container;
    needsSave = true;
  }
  if (needsSave) {
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  }
  return summarizeAiAnalysis(container);
}

async function getAiAnalysisWizardJob({ userId, organizationId, packId, job: jobRaw }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });
  const job = parseJobId(jobRaw);
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  return buildWizardJobDto(ensureAiAnalysisContainer(pack.aiAnalysis), job);
}

async function runAiAnalysisJob({
  userId,
  organizationId,
  packId,
  job: jobRaw,
  force = false,
}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const job = parseJobId(jobRaw);
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  assertPackStatusAllowsAi(pack);
  assertPackReadyForAiAnalysis(pack.toObject());

  let container = ensurePackContainer(pack);
  const gc = failStalePendingAiAnalysisJobs(container);
  if (gc.changed) {
    container = gc.container;
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
  }
  assertPreviousJobConfirmed(container, job);
  assertJobNotConfirmedForRerun(container, job, {
    frList: pack.functionalRequirements || [],
  });

  if (shouldSkipRerunBecauseReady(container, job, { force: Boolean(force) })) {
    return {
      job,
      status: getJobStatus(container, job),
      schemaVersion: container.schemaVersion,
      skipped: true,
      reason: 'already_ready',
    };
  }

  const compactOn = isCompactV2Enabled();
  // Session warm for classic + compact — avoid cold warm on every job when keep_alive holds model.
  await warmOllamaModelSession({ ttlMs: compactSessionWarmTtlMs() });

  // durationMs excludes warm for all jobs (timer starts after session warm).
  const runStartedAt = Date.now();
  const elapsedDurationMs = () => Math.max(0, Date.now() - runStartedAt);

  if (job === 'hierarchyDecomposition') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const hierarchyResult = await runHierarchyDecomposition(pack.toObject(), {
      wallMs: resolveJobWallMs('hierarchyDecomposition'),
    });

    container = ensureAiAnalysisContainer(container);
    container = markJobReadyStub(container, job);
    container = applyHierarchyToContainer(container, hierarchyResult);
    container.jobs.hierarchyDecomposition = {
      ...container.jobs.hierarchyDecomposition,
      status: 'ready',
      model: hierarchyResult.model || null,
      generatedAt: hierarchyResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: hierarchyResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: hierarchyResult.meta?.llmCalls ?? 0,
      partial: Boolean(hierarchyResult.meta?.partial),
      durationMs: pack.aiAnalysis.jobs.hierarchyDecomposition.durationMs,
      proposedFeatureCount: (hierarchyResult.proposedFeatures || []).length,
      proposedRequirementCount: (hierarchyResult.proposedRequirements || []).length,
      disabled: Boolean(hierarchyResult.meta?.disabled),
    };
  }

  if (job === 'requirementAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = pack.toObject();
    const importIssuesBefore = pack.importIssues;

    let dataResult;
    let gapResult;
    let llmCalls;
    let partial;
    let jobError;

    if (compactOn) {
      const compact = await runCompactRequirementAnalysis(packObj, container, {
        force: Boolean(force),
        wallMs: resolveJobWallMs('requirementAnalysis'),
      });
      container = compact.container;
      dataResult = compact.dataResult;
      gapResult = compact.gapResult;
      llmCalls = compact.llmCalls;
      partial = Boolean(dataResult.meta?.partial || gapResult.meta?.partial);
      jobError = dataResult.meta?.error || gapResult.meta?.error || null;
    } else {
      const wallMs = resolveJobWallMs('requirementAnalysis');
      const wallStartedAt = Date.now();
      dataResult = await runDataAnalysis(packObj, {
        hierarchy: container?.analyses?.hierarchy || null,
        wallMs,
      });
      gapResult = await runGapAnalysis(packObj, {
        hierarchy: container?.analyses?.hierarchy || null,
        wallMs: remainingWallMs(wallMs, wallStartedAt),
      });
      llmCalls =
        (dataResult.meta?.llmCalls ?? 0) + (gapResult.meta?.llmCalls ?? 0);
      partial = Boolean(dataResult.meta?.partial || gapResult.meta?.partial);
      jobError = dataResult.meta?.error || gapResult.meta?.error || null;
    }

    container = ensureAiAnalysisContainer(container);
    container = markJobReadyStub(container, job);
    container = applyDataToContainer(container, dataResult);
    container = applyGapToContainer(container, gapResult);

    const models = [dataResult.model, gapResult.model].filter(Boolean);

    container.jobs.requirementAnalysis = {
      ...container.jobs.requirementAnalysis,
      status: 'ready',
      model: models[0] || null,
      generatedAt: gapResult.generatedAt || dataResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: jobError,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    if (importIssuesBefore !== undefined) pack.importIssues = importIssuesBefore;
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls,
      partial,
      cacheHit: Boolean(dataResult.meta?.cacheHit || gapResult.meta?.cacheHit),
      durationMs: pack.aiAnalysis.jobs.requirementAnalysis.durationMs,
      entityCount: (dataResult.entities || []).length,
      dataFlowCount: (dataResult.dataFlows || []).length,
      gapCount: (gapResult.items || []).length,
      severityCounts: gapResult.meta?.severityCounts || null,
      hardBlockNextJob: Boolean(gapResult.meta?.hardBlockNextJob),
    };
  }

  if (job === 'capabilityAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    let capabilityResult;
    if (compactOn) {
      const compact = await runCompactCapabilityAnalysis(pack.toObject(), container, {
        force: Boolean(force),
        wallMs: resolveJobWallMs('capabilityAnalysis'),
      });
      container = compact.container;
      capabilityResult = compact.capabilityResult;
    } else {
      capabilityResult = await runCapabilityAnalysis(pack.toObject(), {
        hierarchy: container?.analyses?.hierarchy || null,
        wallMs: resolveJobWallMs('capabilityAnalysis'),
      });
    }

    container = ensureAiAnalysisContainer(container);
    container = markJobReadyStub(container, job);
    container = applyCapabilityToContainer(container, capabilityResult);
    const capabilityItems = capabilityResult.items || [];
    const capabilityEmpty = capabilityItems.length === 0;
    const capabilityStatus = capabilityEmpty ? 'failed' : 'ready';
    const capabilityError = capabilityEmpty
      ? capabilityResult.meta?.error || 'empty_requirement_leaves'
      : capabilityResult.meta?.error || null;
    container.jobs.capabilityAnalysis = {
      ...container.jobs.capabilityAnalysis,
      status: capabilityStatus,
      model: capabilityResult.model || null,
      generatedAt: capabilityResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: capabilityError,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = capabilityEmpty ? 'failed' : 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: capabilityStatus,
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: capabilityResult.meta?.llmCalls ?? 0,
      partial: Boolean(capabilityResult.meta?.partial),
      cacheHit: Boolean(capabilityResult.meta?.cacheHit),
      durationMs: pack.aiAnalysis.jobs.capabilityAnalysis.durationMs,
      capabilityCount: capabilityItems.length,
      ...(capabilityEmpty ? { error: capabilityError } : {}),
    };
  }

  if (job === 'wbsGeneration') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const caps = container.analyses?.capability?.items || [];

    let wbsResult;
    if (compactOn) {
      const compact = await runCompactWbsGeneration(packObj, container, {
        force: Boolean(force),
        capabilities: caps,
        wallMs: resolveJobWallMs('wbsGeneration'),
      });
      container = compact.container;
      wbsResult = compact.wbsResult;
    } else {
      wbsResult = await runWbsTaskGeneration(packObj, container, {
        capabilities: caps,
        wallMs: resolveJobWallMs('wbsGeneration'),
      });
    }

    container = applyWbsToContainer(container, wbsResult);
    container.jobs.wbsGeneration = {
      ...container.jobs.wbsGeneration,
      status: 'ready',
      model: wbsResult.model || null,
      generatedAt: wbsResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: wbsResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: wbsResult.meta?.llmCalls ?? 0,
      partial: Boolean(wbsResult.meta?.partial),
      cacheHit: Boolean(wbsResult.meta?.cacheHit),
      durationMs: pack.aiAnalysis.jobs.wbsGeneration.durationMs,
      taskCount: (wbsResult.tasks || []).length,
    };
  }

  if (job === 'dependencyAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);

    let depResult;
    if (compactOn) {
      const compact = await runCompactDependencyAnalysis(packObj, container, {
        force: Boolean(force),
        wallMs: resolveJobWallMs('dependencyAnalysis'),
      });
      depResult = compact.depResult;
    } else {
      depResult = await runDependencyAnalysis(packObj, container, {
        wallMs: resolveJobWallMs('dependencyAnalysis'),
      });
    }

    container = markJobReadyStub(container, job);
    container = applyDependencyToContainer(container, depResult);
    if (Array.isArray(container.planning?.tasks) && container.planning.tasks.length) {
      container.planning.tasks = applyDependencyOrderHint(
        container.planning.tasks,
        depResult.orderHint || []
      );
    }
    container.jobs.dependencyAnalysis = {
      ...container.jobs.dependencyAnalysis,
      status: 'ready',
      model: depResult.model || null,
      generatedAt: depResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: depResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: depResult.meta?.llmCalls ?? 0,
      partial: Boolean(depResult.meta?.partial),
      durationMs: pack.aiAnalysis.jobs.dependencyAnalysis.durationMs,
      edgeCount: (depResult.edges || []).length,
      orderHintCount: (depResult.orderHint || []).length,
      cycleBroken: (depResult.meta?.cycleBroken || []).length,
    };
  }

  if (job === 'architectureRiskAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);

    let archResult;
    let riskResult;
    let llmCalls;
    let partial;
    let jobError;

    if (compactOn) {
      const compact = await runCompactArchitectureRiskAnalysis(packObj, container, {
        force: Boolean(force),
        wallMs: resolveJobWallMs('architectureRiskAnalysis'),
      });
      container = compact.container;
      archResult = compact.archResult;
      riskResult = compact.riskResult;
      llmCalls = compact.llmCalls;
      partial = Boolean(archResult.meta?.partial || riskResult.meta?.partial);
      jobError = archResult.meta?.error || riskResult.meta?.error || null;
    } else {
      const wallMs = resolveJobWallMs('architectureRiskAnalysis');
      const wallStartedAt = Date.now();
      archResult = await runArchitectureImpactAnalysis(packObj, container, {
        wallMs,
      });
      container = markJobReadyStub(container, job);
      container = applyArchitectureImpactToContainer(container, archResult);
      riskResult = await runRiskAnalysis(packObj, container, {
        wallMs: remainingWallMs(wallMs, wallStartedAt),
      });
      llmCalls =
        (archResult.meta?.llmCalls ?? 0) + (riskResult.meta?.llmCalls ?? 0);
      partial = Boolean(archResult.meta?.partial || riskResult.meta?.partial);
      jobError = archResult.meta?.error || riskResult.meta?.error || null;
    }

    container = markJobReadyStub(container, job);
    container = applyArchitectureImpactToContainer(container, archResult);
    container = applyRiskToContainer(container, riskResult);

    const models = [archResult.model, riskResult.model].filter(Boolean);

    container.jobs.architectureRiskAnalysis = {
      ...container.jobs.architectureRiskAnalysis,
      status: 'ready',
      model: models[0] || null,
      generatedAt: riskResult.generatedAt || archResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: jobError,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls,
      partial,
      cacheHit: Boolean(archResult.meta?.cacheHit || riskResult.meta?.cacheHit),
      durationMs: pack.aiAnalysis.jobs.architectureRiskAnalysis.durationMs,
      architectureImpactCount: (archResult.items || []).length,
      chainCount: (archResult.chains || []).length,
      riskCount: (riskResult.items || []).length,
      riskBandCounts: riskResult.meta?.bandCounts || null,
      hardBlockNextJob: Boolean(riskResult.meta?.hardBlockNextJob),
    };
  }

  if (job === 'effortRoleAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const roleSkillResult = runRoleSkillPlanning(packObj, container);
    container = applyRoleSkillToContainer(container, roleSkillResult);
    const effortResult = runEffortEngine(container);
    container = applyEffortToContainer(container, effortResult);

    container.jobs.effortRoleAnalysis = {
      ...container.jobs.effortRoleAnalysis,
      status: 'ready',
      model: null,
      generatedAt: effortResult.generatedAt || roleSkillResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: 0,
      durationMs: pack.aiAnalysis.jobs.effortRoleAnalysis.durationMs,
      roleCount: (roleSkillResult.roles || []).length,
      skillCount: (roleSkillResult.skills || []).length,
      estimatedHoursTotal: effortResult.effort?.estimatedHoursTotal ?? 0,
      hasProjectManager: Boolean(roleSkillResult.meta?.hasProjectManager),
    };
  }

  if (job === 'sequencingCpm') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const cpmResult = runSequencingCpm(container);
    container = applySequencingCpmToContainer(container, cpmResult);
    container.jobs.sequencingCpm = {
      ...container.jobs.sequencingCpm,
      status: 'ready',
      model: null,
      generatedAt: cpmResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: 0,
      durationMs: pack.aiAnalysis.jobs.sequencingCpm.durationMs,
      projectDurationHours: cpmResult.theoreticalCpm?.projectDurationHours ?? 0,
      criticalCount: (cpmResult.criticalWorkIds || []).length,
      unresolvedEdgeCount: cpmResult.meta?.unresolvedEdgeCount ?? 0,
    };
  }

  if (job === 'employeeMatching') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);

    const { listOrgResourcePool } = require('./orgResourcePool.service');
    let pool;
    try {
      pool = await listOrgResourcePool({
        organizationId,
        actorUserId: userId,
        requirementPackId: String(packId),
        skipCapacityAuth: true,
        forAiPlanning: true,
        limit: 200,
      });
    } catch (windowErr) {
      if (windowErr.errorCode !== 'PLANNING_WINDOW_INCOMPLETE') {
        const err = new Error(
          windowErr.message || 'Failed to load organization resource pool for matching'
        );
        err.statusCode = windowErr.statusCode || 502;
        err.errorCode = windowErr.errorCode || 'POOL_LOAD_FAILED';
        err.cause = windowErr;
        throw err;
      }
      pool = await listOrgResourcePool({
        organizationId,
        actorUserId: userId,
        skipCapacityAuth: true,
        forAiPlanning: true,
        limit: 200,
      });
    }
    const poolItems = Array.isArray(pool?.items)
      ? pool.items
      : Array.isArray(pool)
        ? pool
        : [];

    const matchResult = await runEmployeeMatching(pack.toObject(), container, {
      poolItems,
    });
    container = applyMatchingToContainer(container, matchResult);
    container.jobs.employeeMatching = {
      ...container.jobs.employeeMatching,
      status: 'ready',
      model: null,
      generatedAt: matchResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: matchResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: 0,
      durationMs: pack.aiAnalysis.jobs.employeeMatching.durationMs,
      fteCount: (matchResult.fte || []).length,
      recommendationCount: (matchResult.recommendations || []).length,
      poolSize: matchResult.meta?.poolSize ?? poolItems.length,
      filteredProjectCap: matchResult.meta?.filteredProjectCap ?? 0,
      assignmentCount: 0,
    };
  }

  if (job === 'scheduleCapacity') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const projectStart =
      pack.overview?.startDate || pack.staffingPlan?.startDate || null;
    const scheduleResult = runScheduleCapacity(container, {
      forceHeuristic: true,
      projectStart,
    });
    container = applyScheduleCapacityToContainer(container, scheduleResult);
    container.jobs.scheduleCapacity = {
      ...container.jobs.scheduleCapacity,
      status: 'ready',
      model: null,
      generatedAt: scheduleResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: scheduleResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: 0,
      durationMs: pack.aiAnalysis.jobs.scheduleCapacity.durationMs,
      assignmentCount: (scheduleResult.assignments || []).length,
      scheduleRowCount: (scheduleResult.schedule || []).length,
      estimatedEnd: scheduleResult.completion?.estimatedEnd || null,
      projectStart: scheduleResult.completion?.projectStart || null,
    };
  }

  if (job === 'projectPlan') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const executionPlan = buildExecutionPlanFromContainer(container);
    container = applyProjectPlanToContainer(container, executionPlan);
    container.jobs.projectPlan = {
      ...container.jobs.projectPlan,
      status: 'ready',
      model: null,
      generatedAt: executionPlan.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: 0,
      durationMs: pack.aiAnalysis.jobs.projectPlan.durationMs,
      estimatedEnd: executionPlan.estimatedEnd,
      workCount: (executionPlan.works || []).length,
    };
  }

  pack.aiAnalysis = markJobReadyStub(container, job);
  pack.aiAnalysis.jobs[job] = {
    ...pack.aiAnalysis.jobs[job],
    durationMs: elapsedDurationMs(),
  };
  pack.aiAnalysisStatus = 'ready';
  pack.markModified('aiAnalysis');
  await pack.save();

  return {
    job,
    status: pack.aiAnalysis.jobs[job].status,
    schemaVersion: pack.aiAnalysis.schemaVersion,
    durationMs: pack.aiAnalysis.jobs[job].durationMs,
  };
}

async function confirmAiAnalysisJob({
  userId,
  organizationId,
  packId,
  job: jobRaw,
  edits = null,
}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const job = parseJobId(jobRaw);
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  assertPackStatusAllowsAi(pack);

  let container = ensurePackContainer(pack);
  const status = getJobStatus(container, job);
  if (status !== 'ready' && status !== 'confirmed') {
    const err = new Error(`Job ${job} must be ready before confirm (current: ${status})`);
    err.statusCode = 409;
    err.errorCode = 'AI_ANALYSIS_JOB_NOT_READY';
    err.details = { job, status };
    throw err;
  }

  container = applyJobEdits(container, job, edits);

  if (job === 'scheduleCapacity' && edits?.resource?.assignments) {
    const { valid, rejected } = validateAssignmentsAgainstShortlist(
      edits.resource.assignments,
      container.resource?.recommendations || []
    );
    if (rejected.length) {
      const err = new Error('Assignment userId must be in employeeMatching shortlist');
      err.statusCode = 400;
      err.errorCode = 'AI_ANALYSIS_ASSIGN_NOT_IN_SHORTLIST';
      err.details = { rejected };
      throw err;
    }
    container.resource.assignments = valid;
  }

  if (job === 'hierarchyDecomposition') {
    const hierarchy = container.analyses?.hierarchy || {};
    const merged = mergeHierarchyProposalsIntoFrList(
      pack.functionalRequirements || [],
      {
        proposedFeatures: hierarchy.proposedFeatures || [],
        proposedRequirements: hierarchy.proposedRequirements || [],
      },
      { onlyAccepted: true }
    );
    pack.functionalRequirements = merged.frList;
    pack.markModified('functionalRequirements');
    container = markJobsStaleAfter(container, 'hierarchyDecomposition');
    pack.aiAnalysis = markJobConfirmed(container, job);
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'confirmed',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      addedCount: merged.addedCount,
      addedIds: merged.addedIds,
    };
  }

  if (job === 'capabilityAnalysis') {
    assertCapabilityConfirmable(container);
  }

  pack.aiAnalysis = markJobConfirmed(container, job);
  pack.aiAnalysisStatus = 'ready';
  pack.markModified('aiAnalysis');
  await pack.save();

  return {
    job,
    status: 'confirmed',
    schemaVersion: pack.aiAnalysis.schemaVersion,
  };
}

async function exportAiAnalysisSheet11({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  const buffer = await buildAiAnalysisSheet11Buffer(
    ensureAiAnalysisContainer(pack.aiAnalysis)
  );
  return {
    buffer: Buffer.from(buffer),
    fileName: `AI_Analysis_Output_${String(packId).slice(-6)}.xlsx`,
  };
}

module.exports = {
  getAiAnalysisSummary,
  getAiAnalysisWizardJob,
  runAiAnalysisJob,
  confirmAiAnalysisJob,
  exportAiAnalysisSheet11,
  assertBlueprintReadyForProjectCreate: (...args) =>
    require('../utils/aiAnalysis/aiAnalysisBlueprintImport').assertBlueprintReadyForProjectCreate(
      ...args
    ),
  mapBlueprintTasksToImportPlan: (...args) =>
    require('../utils/aiAnalysis/aiAnalysisBlueprintImport').mapBlueprintTasksToImportPlan(
      ...args
    ),
};

