/**
 * AI Analysis job orchestration (schema v2) — 12 user jobs + gates.
 *
 * Deterministic HOW jobs (effortRoleAnalysis, sequencingCpm, employeeMatching,
 * scheduleCapacity) always run remotely via ai-project-planning-service S2S.
 * AI_PLANNING_REMOTE=0 must NOT reopen in-process HOW engines (flag ignored for
 * HOW routing). LLM WHAT / compact orchestrator / projectPlan remain local.
 */

const RequirementPack = require('../models/RequirementPack');
const aiProjectPlanningClient = require('../clients/aiProjectPlanning.client');
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
  validateAssignmentsAgainstShortlist,
} = require('../utils/aiAnalysis/aiAnalysisAssignment');
const {
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
const {
  loadActiveSnapshotDocument,
  assertSnapshotRequired,
  isSnapshotPipelineEnabled,
} = require('./aiAnalysisSnapshot.service');
const { buildJobInputFromSnapshot, buildPackObjectFromSnapshot } = require('../utils/aiAnalysis/pipeline/buildPipeline');

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);
const REMOTE_HOW_JOBS = new Set([
  'effortRoleAnalysis',
  'sequencingCpm',
  'employeeMatching',
  'scheduleCapacity',
]);

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

/** ADR 0003 RULE-04 — HOW/Planning jobs only after Requirement pack approved. */
function assertHowJobsRequireApprovedPack(pack, job) {
  const { isAiAnalysisHowJob } = require('../constants/aiAnalysisJobs.constants');
  if (!isAiAnalysisHowJob(job)) return;
  const status = String(pack.status || '');
  if (status !== 'approved' && status !== 'project_linked') {
    const err = new Error(
      'Planning AI jobs (WBS…Project Plan) yêu cầu Requirement pack đã approved — không chạy trên path SRS/Requirement draft'
    );
    err.statusCode = 422;
    err.errorCode = 'AI_ANALYSIS_HOW_REQUIRES_APPROVED';
    err.details = { status, job };
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
  return {
    ...summarizeAiAnalysis(container),
    snapshot: pack.aiAnalysisSnapshotMeta || null,
  };
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

/**
 * Legacy env helper (tests / docs). HOW routing ignores this flag — deterministic
 * HOW jobs are always remote via shouldRunRemoteAiPlanning.
 */
function isAiPlanningRemoteEnabled() {
  return String(process.env.AI_PLANNING_REMOTE ?? '1').trim() !== '0';
}

function shouldRunRemoteAiPlanning(job) {
  return REMOTE_HOW_JOBS.has(String(job || ''));
}

/**
 * Remote 202 path — project facade only starts S2S run (no in-process LLM).
 */
async function startRemoteAiPlanningRun({
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
  assertHowJobsRequireApprovedPack(pack, job);
  assertPackReadyForAiAnalysis(pack.toObject());

  let snapshotId = pack.aiAnalysisActiveSnapshotId
    ? String(pack.aiAnalysisActiveSnapshotId)
    : null;
  let snapshotDoc = null;
  if (isSnapshotPipelineEnabled()) {
    snapshotDoc = await loadActiveSnapshotDocument({
      organizationId,
      packId,
      pack,
    });
    assertSnapshotRequired(snapshotDoc);
    if (snapshotDoc) snapshotId = String(snapshotDoc._id);
  }
  if (!snapshotId) {
    const err = new Error('Active AI snapshot required for remote planning');
    err.statusCode = 400;
    err.errorCode = 'SNAPSHOT_REQUIRED';
    throw err;
  }
  if (!snapshotDoc) {
    const err = new Error('Immutable AI snapshot payload required for remote planning');
    err.statusCode = 400;
    err.errorCode = 'SNAPSHOT_PAYLOAD_REQUIRED';
    throw err;
  }

  let container = ensurePackContainer(pack);
  const targetPendingGeneratedAt = container.jobs?.[job]?.generatedAt || null;
  const targetWasPending = getJobStatus(container, job) === 'pending';
  const stalePending = failStalePendingAiAnalysisJobs(container);
  if (stalePending.changed) {
    container = stalePending.container;
  }
  const targetPendingExpired =
    targetWasPending &&
    getJobStatus(container, job) === 'failed' &&
    container.jobs?.[job]?.error === 'stale_pending_timeout';
  assertPreviousJobConfirmed(container, job);
  assertJobNotConfirmedForRerun(container, job, {
    frList: pack.functionalRequirements || [],
  });
  if (shouldSkipRerunBecauseReady(container, job, { force: Boolean(force) })) {
    return {
      accepted: false,
      remote: true,
      job,
      status: getJobStatus(container, job),
      snapshotId,
      schemaVersion: container.schemaVersion,
      skipped: true,
      reason: 'already_ready',
    };
  }
  const overlayFrList =
    job !== 'hierarchyDecomposition' &&
    getJobStatus(container, 'hierarchyDecomposition') === 'confirmed'
      ? pack.functionalRequirements || []
      : undefined;
  const snapshotObject = snapshotDoc.toObject();
  const jobInput = buildJobInputFromSnapshot(snapshotObject, job, { overlayFrList });
  const packForJob = buildPackObjectFromSnapshot(pack, snapshotObject, {
    overlayFrList,
    job,
    jobFiltered: jobInput?.jobFiltered || null,
  });

  const dispatchRequestId = `${String(packId)}:${job}:${snapshotId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const expectedRunId = new RequirementPack.db.base.Types.ObjectId().toString();
  const pendingStartedAt = new Date();
  const pendingContainer = beginJobPending(pack, container, job);
  pendingContainer.jobs[job] = {
    ...pendingContainer.jobs[job],
    remoteRunId: expectedRunId,
    remoteDispatchRequestId: dispatchRequestId,
    snapshotId: String(snapshotId),
    startedAt: pendingStartedAt.toISOString(),
  };
  const pendingWrite = await RequirementPack.updateOne(
    {
      _id: packId,
      organizationId,
      isActive: true,
      aiAnalysisActiveSnapshotId: snapshotId,
      [`aiAnalysis.jobs.${job}.status`]: {
        $in: force
          ? ['empty', 'ready', 'stale', 'failed', ...(targetPendingExpired ? ['pending'] : [])]
          : ['empty', 'stale', 'failed', ...(targetPendingExpired ? ['pending'] : [])],
      },
      ...(targetPendingExpired
        ? {
            [`aiAnalysis.jobs.${job}.generatedAt`]:
              targetPendingGeneratedAt,
          }
        : {}),
    },
    {
      $set: {
        aiAnalysis: pendingContainer,
        aiAnalysisStatus: 'pending',
      },
    }
  );
  if (pendingWrite.modifiedCount !== 1) {
    const conflict = new Error(`Job ${job} already has an active or changed run`);
    conflict.statusCode = 409;
    conflict.errorCode = 'REMOTE_PLANNING_ACTIVE_CONFLICT';
    throw conflict;
  }

  let s2s;
  try {
    s2s = await aiProjectPlanningClient.startRun({
    runId: expectedRunId,
    projectId: pack.projectId ? String(pack.projectId) : null,
    packId: String(packId),
    organizationId: String(organizationId),
    snapshotId,
    approvedSrsVersion: pack.approvedSrsVersion || pack.version || null,
    snapshotPayloadRef: snapshotId,
    trigger: force ? 'force_rerun' : 'manual',
    initiatedBy: userId != null ? String(userId) : null,
    requestKey: dispatchRequestId,
    job,
    input: {
      container,
      pack: packForJob,
      toolData: jobInput?.toolData || {},
      versions: jobInput?.versions || null,
      inputFingerprint: jobInput?.inputFingerprint || null,
    },
    });
  } catch (error) {
    await RequirementPack.updateOne(
      {
        _id: packId,
        organizationId,
        [`aiAnalysis.jobs.${job}.status`]: 'pending',
        [`aiAnalysis.jobs.${job}.remoteDispatchRequestId`]: dispatchRequestId,
      },
      {
        $set: {
          [`aiAnalysis.jobs.${job}.status`]: 'failed',
          [`aiAnalysis.jobs.${job}.error`]: {
            code: error.code || 'REMOTE_PLANNING_DISPATCH_FAILED',
            message: error.message,
          },
          aiAnalysisStatus: 'failed',
        },
      }
    );
    throw error;
  }

  if (s2s.status >= 400) {
    await RequirementPack.updateOne(
      {
        _id: packId,
        organizationId,
        [`aiAnalysis.jobs.${job}.status`]: 'pending',
        [`aiAnalysis.jobs.${job}.remoteDispatchRequestId`]: dispatchRequestId,
      },
      {
        $set: {
          [`aiAnalysis.jobs.${job}.status`]: 'failed',
          [`aiAnalysis.jobs.${job}.error`]: {
            code: s2s.data?.errorCode || 'REMOTE_PLANNING_FAILED',
            message: s2s.data?.message || 'Remote AI planning start failed',
          },
          aiAnalysisStatus: 'failed',
        },
      }
    );
    const err = new Error(
      s2s.data?.message || 'Remote AI planning start failed'
    );
    err.statusCode = s2s.status;
    err.errorCode = s2s.data?.errorCode || 'REMOTE_PLANNING_FAILED';
    throw err;
  }

  const runId = s2s.data?.runId || s2s.data?.data?.runId;
  const status = s2s.data?.status || s2s.data?.data?.status || 'queued';
  if (!runId || String(runId) !== expectedRunId) {
    await RequirementPack.updateOne(
      {
        _id: packId,
        organizationId,
        [`aiAnalysis.jobs.${job}.status`]: 'pending',
        [`aiAnalysis.jobs.${job}.remoteDispatchRequestId`]: dispatchRequestId,
      },
      {
        $set: {
          [`aiAnalysis.jobs.${job}.status`]: 'failed',
          [`aiAnalysis.jobs.${job}.error`]: {
            code: 'REMOTE_PLANNING_RUN_ID_MISMATCH',
          },
          aiAnalysisStatus: 'failed',
        },
      }
    );
    const err = new Error('Remote AI planning returned an unexpected runId');
    err.statusCode = 502;
    err.errorCode = 'REMOTE_PLANNING_RUN_ID_MISMATCH';
    throw err;
  }
  return {
    accepted: true,
    httpStatus: 202,
    remote: true,
    job,
    runId,
    status,
    snapshotId,
    schemaVersion: pack.aiAnalysis?.schemaVersion,
  };
}

async function runAiAnalysisJob({
  userId,
  organizationId,
  packId,
  job: jobRaw,
  force = false,
}) {
  const requestedJob = parseJobId(jobRaw);
  if (shouldRunRemoteAiPlanning(requestedJob)) {
    return startRemoteAiPlanningRun({
      userId,
      organizationId,
      packId,
      job: jobRaw,
      force,
    });
  }
  // Defense in depth: HOW engines removed from project-service in-process path.
  if (REMOTE_HOW_JOBS.has(String(requestedJob || ''))) {
    const err = new Error(
      'Deterministic HOW jobs must run via ai-project-planning-service'
    );
    err.statusCode = 501;
    err.errorCode = 'HOW_INPROCESS_REMOVED';
    throw err;
  }
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const job = parseJobId(jobRaw);
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  assertPackStatusAllowsAi(pack);
  assertHowJobsRequireApprovedPack(pack, job);
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

  let snapshotDoc = null;
  let jobInput = null;
  let packForJob = pack.toObject();
  if (isSnapshotPipelineEnabled()) {
    snapshotDoc = await loadActiveSnapshotDocument({
      organizationId,
      packId,
      pack,
    });
    assertSnapshotRequired(snapshotDoc);
    if (snapshotDoc) {
      const overlayFrList =
        job !== 'hierarchyDecomposition' &&
        getJobStatus(container, 'hierarchyDecomposition') === 'confirmed'
          ? pack.functionalRequirements || []
          : undefined;
      const snapObj = snapshotDoc.toObject();
      jobInput = buildJobInputFromSnapshot(snapObj, job, {
        overlayFrList,
      });
      packForJob = buildPackObjectFromSnapshot(pack, snapObj, {
        overlayFrList,
        job,
        jobFiltered: jobInput?.jobFiltered || null,
      });
    }
  }

  const attachSnapshotMeta = (result) => {
    if (!jobInput) return result;
    return {
      ...result,
      snapshotId: jobInput.snapshotId || undefined,
      inputFingerprint: jobInput.inputFingerprint || undefined,
      versions: jobInput.versions || undefined,
    };
  };

  const compactOn = isCompactV2Enabled();
  // Session warm for classic + compact — avoid cold warm on every job when keep_alive holds model.
  if (!REMOTE_HOW_JOBS.has(job)) {
    await warmOllamaModelSession({ ttlMs: compactSessionWarmTtlMs() });
  }

  // durationMs excludes warm for all jobs (timer starts after session warm).
  const runStartedAt = Date.now();
  const elapsedDurationMs = () => Math.max(0, Date.now() - runStartedAt);

  if (job === 'hierarchyDecomposition') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const hierarchyResult = await runHierarchyDecomposition(packForJob, {
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
      snapshotId: jobInput?.snapshotId || null,
      inputFingerprint: jobInput?.inputFingerprint || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return attachSnapshotMeta({
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: hierarchyResult.meta?.llmCalls ?? 0,
      partial: Boolean(hierarchyResult.meta?.partial),
      durationMs: pack.aiAnalysis.jobs.hierarchyDecomposition.durationMs,
      proposedFeatureCount: (hierarchyResult.proposedFeatures || []).length,
      proposedRequirementCount: (hierarchyResult.proposedRequirements || []).length,
      disabled: Boolean(hierarchyResult.meta?.disabled),
    });
  }

  if (job === 'requirementAnalysis') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = packForJob;
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
      const compact = await runCompactCapabilityAnalysis(packForJob, container, {
        force: Boolean(force),
        wallMs: resolveJobWallMs('capabilityAnalysis'),
      });
      container = compact.container;
      capabilityResult = compact.capabilityResult;
    } else {
      capabilityResult = await runCapabilityAnalysis(packForJob, {
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

  if (job === 'requirementInsights') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const { runRequirementReasoning } = require('../utils/tools/runRequirementReasoning');
    const { buildProposedSrsDraft } = require('../utils/tools/buildProposedSrsDraft');
    const { runPreApprovalValidation } = require('../utils/tools/runPreApprovalValidation');

    const whatAnalyses = {
      hierarchy: container.analyses?.hierarchy || null,
      gap: container.analyses?.gap || null,
      capability: container.analyses?.capability || null,
      data: container.analyses?.data || null,
    };

    const reasoned = await runRequirementReasoning({
      pack: packForJob,
      requirementTools:
        container.analyses?.requirementTools ||
        packForJob?.aiAnalysis?.analyses?.requirementTools ||
        null,
      whatAnalyses,
    });

    const proposedSrs = buildProposedSrsDraft(packForJob, reasoned.insights);
    const packForPre = {
      ...packForJob,
      aiAnalysis: {
        ...(packForJob.aiAnalysis || {}),
        analyses: {
          ...(packForJob.aiAnalysis?.analyses || {}),
          ...(container.analyses || {}),
          requirementInsights: reasoned.insights,
          proposedSrs,
        },
      },
    };
    const preApproval = runPreApprovalValidation(packForPre);

    container = ensureAiAnalysisContainer(container);
    container = markJobReadyStub(container, job);
    container.analyses.requirementInsights = reasoned.insights;
    container.analyses.proposedSrs = proposedSrs;
    container.analyses.preApproval = preApproval;
    container.jobs.requirementInsights = {
      ...container.jobs.requirementInsights,
      status: 'ready',
      model: reasoned.model || 'heuristic',
      generatedAt: new Date().toISOString(),
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
      llmCalls: reasoned.meta?.llmCalls ?? 0,
      mode: reasoned.meta?.mode || null,
      durationMs: pack.aiAnalysis.jobs.requirementInsights.durationMs,
      clarificationCount: Array.isArray(reasoned.insights?.clarifications)
        ? reasoned.insights.clarifications.length
        : 0,
      proposedDeltaCount: Array.isArray(proposedSrs.deltas) ? proposedSrs.deltas.length : 0,
      preApprovalPassed: Boolean(preApproval.passed),
    };
  }

  if (job === 'wbsGeneration') {
    container = beginJobPending(pack, container, job);
    await pack.save();

    const packObj = packForJob;
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

    const packObj = packForJob;
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

    const packObj = packForJob;
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
  assertHowJobsRequireApprovedPack(pack, job);

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

function mergeRemoteHowContainer(current, remote, job) {
  const next = ensureAiAnalysisContainer(current);
  if (job === 'effortRoleAnalysis') {
    next.planning = {
      ...next.planning,
      roles: remote.planning?.roles || [],
      skills: remote.planning?.skills || [],
      tasks: remote.planning?.tasks || [],
      effort: remote.planning?.effort || null,
    };
  } else if (job === 'sequencingCpm') {
    next.planning = {
      ...next.planning,
      sequence: remote.planning?.sequence || { waves: [] },
      theoreticalCpm: remote.planning?.theoreticalCpm || null,
      criticalWorkIds: remote.planning?.criticalWorkIds || [],
    };
  } else if (job === 'employeeMatching') {
    next.resource = {
      ...next.resource,
      fte: remote.resource?.fte || [],
      recommendations: remote.resource?.recommendations || [],
    };
  } else if (job === 'scheduleCapacity') {
    next.planning = {
      ...next.planning,
      tasks: remote.planning?.tasks || next.planning?.tasks || [],
      completion: remote.planning?.completion || null,
    };
    next.resource = {
      ...next.resource,
      assignments: remote.resource?.assignments || [],
      assignmentsMeta: {
        ...(next.resource?.assignmentsMeta || {}),
        ...(remote.resource?.assignmentsMeta || {}),
      },
      schedule: remote.resource?.schedule || [],
    };
  }
  next.jobs[job] = { ...next.jobs[job], ...remote.jobs?.[job] };
  return next;
}

function isDuplicateRemoteRun(container, job, runId) {
  const recorded =
    container?.resource?.assignmentsMeta?.remoteRunIds?.[job] ||
    container?.jobs?.[job]?.remoteRunId;
  return Boolean(runId) && String(recorded || '') === String(runId);
}

async function applyRemoteHowJobResult({
  runId,
  status,
  job: jobRaw,
  projectId,
  packId,
  organizationId,
  snapshotId,
  result,
  error,
}) {
  const job = parseJobId(jobRaw);
  if (!REMOTE_HOW_JOBS.has(job)) {
    const invalid = new Error(`Remote callback job is not supported: ${job}`);
    invalid.statusCode = 400;
    invalid.errorCode = 'REMOTE_HOW_JOB_INVALID';
    throw invalid;
  }
  if (!runId || !packId || !organizationId || !snapshotId) {
    const invalid = new Error('runId, packId, organizationId and snapshotId are required');
    invalid.statusCode = 400;
    invalid.errorCode = 'REMOTE_RESULT_IDENTIFIERS_REQUIRED';
    throw invalid;
  }
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  if (projectId && pack.projectId && String(pack.projectId) !== String(projectId)) {
    const invalid = new Error('Remote result projectId does not match requirement pack');
    invalid.statusCode = 409;
    invalid.errorCode = 'REMOTE_RESULT_PROJECT_MISMATCH';
    throw invalid;
  }
  if (String(pack.aiAnalysisActiveSnapshotId || '') !== String(snapshotId)) {
    return {
      applied: false,
      stale: true,
      reason: 'snapshot_not_active',
      job,
      runId,
    };
  }
  const activeJob = pack.aiAnalysis?.jobs?.[job] || {};
  if (
    String(activeJob.remoteRunId || '') === String(runId) &&
    activeJob.status !== 'pending'
  ) {
    return { applied: false, idempotent: true, job, runId };
  }
  if (
    activeJob.status !== 'pending' ||
    String(activeJob.snapshotId || '') !== String(snapshotId) ||
    String(activeJob.remoteRunId || '') !== String(runId)
  ) {
    return {
      applied: false,
      stale: true,
      reason: 'run_not_active',
      job,
      runId,
    };
  }
  let container = ensurePackContainer(pack);
  if (status === 'completed') {
    if (!result?.container || result.job !== job) {
      const invalid = new Error('Completed remote result must include matching container and job');
      invalid.statusCode = 400;
      invalid.errorCode = 'REMOTE_RESULT_INVALID';
      throw invalid;
    }
    container = mergeRemoteHowContainer(container, result.container, job);
    container.jobs[job] = {
      ...container.jobs[job],
      status: 'ready',
      remoteRunId: String(runId),
      snapshotId: String(snapshotId),
      error: null,
    };
    pack.aiAnalysisStatus = 'ready';
  } else if (status === 'failed') {
    container.jobs[job] = {
      ...container.jobs[job],
      status: 'failed',
      remoteRunId: String(runId),
      snapshotId: String(snapshotId),
      error: error || { code: 'REMOTE_HOW_JOB_FAILED' },
    };
    pack.aiAnalysisStatus = 'failed';
  } else {
    const invalid = new Error(`Invalid remote result status: ${status}`);
    invalid.statusCode = 400;
    invalid.errorCode = 'REMOTE_RESULT_STATUS_INVALID';
    throw invalid;
  }
  container.resource = {
    ...container.resource,
    assignmentsMeta: {
      ...(container.resource?.assignmentsMeta || {}),
      remoteRunIds: {
        ...(container.resource?.assignmentsMeta?.remoteRunIds || {}),
        [job]: String(runId),
      },
    },
  };
  const callbackFilter = {
      _id: packId,
      organizationId,
      isActive: true,
      aiAnalysisActiveSnapshotId: snapshotId,
      [`aiAnalysis.jobs.${job}.status`]: 'pending',
      [`aiAnalysis.jobs.${job}.snapshotId`]: String(snapshotId),
      [`aiAnalysis.jobs.${job}.remoteRunId`]: String(runId),
      ...(pack.updatedAt ? { updatedAt: pack.updatedAt } : {}),
    };
  const appliedPack = await RequirementPack.findOneAndUpdate(
    callbackFilter,
    {
      $set: {
        aiAnalysis: container,
        aiAnalysisStatus: status === 'completed' ? 'ready' : 'failed',
      },
    },
    { new: true }
  );
  if (!appliedPack) {
    const latestPack = await loadPackForAiAnalysis({ packId, organizationId });
    if (String(latestPack.aiAnalysisActiveSnapshotId || '') !== String(snapshotId)) {
      return {
        applied: false,
        stale: true,
        reason: 'snapshot_superseded',
        job,
        runId,
      };
    }
    const latestJob = latestPack.aiAnalysis?.jobs?.[job] || {};
    if (
      String(latestJob.remoteRunId || '') === String(runId) &&
      latestJob.status !== 'pending'
    ) {
      return { applied: false, idempotent: true, job, runId };
    }
    if (
      latestJob.status !== 'pending' ||
      String(latestJob.snapshotId || '') !== String(snapshotId) ||
      String(latestJob.remoteRunId || '') !== String(runId)
    ) {
      return {
        applied: false,
        stale: true,
        reason: 'run_superseded',
        job,
        runId,
      };
    }
    return {
      applied: false,
      stale: false,
      retryable: true,
      reason: 'conditional_update_missed',
      job,
      runId,
    };
  }
  return { applied: true, idempotent: false, job, runId, status };
}

module.exports = {
  getAiAnalysisSummary,
  getAiAnalysisWizardJob,
  runAiAnalysisJob,
  startRemoteAiPlanningRun,
  isAiPlanningRemoteEnabled,
  shouldRunRemoteAiPlanning,
  isDuplicateRemoteRun,
  applyRemoteHowJobResult,
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

