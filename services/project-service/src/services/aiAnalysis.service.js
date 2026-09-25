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
const { parseJobId, AI_ANALYSIS_USER_JOBS } = require('../constants/aiAnalysisJobs.constants');
const { ensureHierarchyDecompositionMigrated } = require('../utils/aiAnalysis/aiAnalysisMigrateJobs');
const { buildAiAnalysisSheet11Buffer } = require('../utils/aiAnalysis/aiAnalysisSheet11Export');
const {
  validateAssignmentsAgainstShortlist,
} = require('../utils/aiAnalysis/aiAnalysisAssignment');
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
  ensureActiveAiAnalysisSnapshot,
  isSnapshotPipelineEnabled,
} = require('./aiAnalysisSnapshot.service');
const { buildJobInputFromSnapshot, buildPackObjectFromSnapshot } = require('../utils/aiAnalysis/pipeline/buildPipeline');

const ALLOWED_STATUS_SET = new Set(AI_PLANNING_ALLOWED_STATUSES);
/** All AI Analysis user jobs run remotely via APS job registry. */
const REMOTE_HOW_JOBS = new Set(AI_ANALYSIS_USER_JOBS);

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

function assertPackStatusAllowsAi(pack, job = null) {
  const status = String(pack.status || '');
  if (ALLOWED_STATUS_SET.has(status)) return;
  // Draft project HITL: WHAT jobs may run on intake draft (fill Scope/FR from docs).
  if (status === 'draft' && job) {
    const { isAiAnalysisWhatJob } = require('../constants/aiAnalysisJobs.constants');
    if (isAiAnalysisWhatJob(job)) return;
  }
  const err = new Error(
    `Không chạy AI Analysis ở trạng thái ${status} (cần under_review|approved|project_linked)`
  );
  err.statusCode = 422;
  err.errorCode = 'AI_ANALYSIS_STATUS_NOT_ALLOWED';
  err.details = { status, job: job || undefined };
  throw err;
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
async function startRemoteAiPlanningRun() {
  const err = new Error('startRemoteAiPlanningRun removed — use startPhaseAiPlanningRun');
  err.statusCode = 410;
  err.errorCode = 'JOB_BY_JOB_REMOVED';
  throw err;
}

async function runAiAnalysisJob({
  userId,
  organizationId,
  packId,
  job: jobRaw,
  force = false,
}) {
  void userId;
  void organizationId;
  void packId;
  void force;
  // RULE-JJ-01: per-job run removed — use startPhaseAiPlanningRun (phase_what / phase_how).
  let requestedJob = String(jobRaw || '').trim();
  try {
    requestedJob = parseJobId(jobRaw);
  } catch {
    /* keep raw for error details */
  }
  const err = new Error(
    `Job-by-job AI Analysis run is removed — use phase-run (phase_what / phase_how) instead of job="${requestedJob}"`
  );
  err.statusCode = 410;
  err.errorCode = 'JOB_BY_JOB_REMOVED';
  err.details = { job: requestedJob, use: 'POST …/ai-analysis/phase-run' };
  throw err;
}

async function confirmAiAnalysisJob({
  userId,
  organizationId,
  packId,
  job: jobRaw,
  phase: phaseRaw,
  edits = null,
}) {
  void edits;
  const phaseHint = String(phaseRaw || '').trim().toLowerCase();
  const jobHint = String(jobRaw || '').trim();
  if (jobHint) {
    const err = new Error(
      `Confirm uses phase=how only — job="${jobHint}" is not allowed`
    );
    err.statusCode = 409;
    err.errorCode = 'CONFIRM_ONLY_PROJECT_PLAN';
    err.details = { job: jobHint, allowed: ['phase=how'] };
    throw err;
  }
  if (phaseHint !== 'how' && phaseHint !== 'phase_how') {
    const err = new Error(
      `Confirm requires phase=how — got phase="${phaseHint || ''}"`
    );
    err.statusCode = 409;
    err.errorCode = 'CONFIRM_ONLY_PROJECT_PLAN';
    err.details = { phase: phaseHint || null, allowed: ['how'] };
    throw err;
  }

  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const {
    assertPhaseHowReadyForConfirm,
    markPhaseHowConfirmed,
    migrateJobsProjectionToPhaseRuns,
  } = require('../utils/aiAnalysis/phaseGate2');

  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  let container = migrateJobsProjectionToPhaseRuns(ensurePackContainer(pack));
  assertPhaseHowReadyForConfirm(container);
  container = markPhaseHowConfirmed(container);
  pack.aiAnalysis = container;
  pack.aiAnalysisStatus = 'ready';
  pack.markModified('aiAnalysis');
  await pack.save();

  return {
    phase: 'how',
    job: 'phase_how',
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
  } else if (job === 'hierarchyDecomposition') {
    next.analyses = {
      ...next.analyses,
      hierarchy: remote.analyses?.hierarchy || next.analyses?.hierarchy,
    };
  } else if (job === 'requirementAnalysis') {
    next.analyses = {
      ...next.analyses,
      data: remote.analyses?.data || next.analyses?.data,
      gap: remote.analyses?.gap || next.analyses?.gap,
    };
  } else if (job === 'capabilityAnalysis') {
    next.analyses = {
      ...next.analyses,
      capability: remote.analyses?.capability || next.analyses?.capability,
    };
  } else if (job === 'requirementInsights') {
    next.analyses = {
      ...next.analyses,
      requirementInsights:
        remote.analyses?.requirementInsights || next.analyses?.requirementInsights,
      proposedSrs: remote.analyses?.proposedSrs || next.analyses?.proposedSrs,
      preApproval: remote.analyses?.preApproval || next.analyses?.preApproval,
    };
  } else if (job === 'wbsGeneration') {
    next.planning = {
      ...next.planning,
      tasks: remote.planning?.tasks || [],
      wbs: remote.planning?.wbs || null,
    };
  } else if (job === 'dependencyAnalysis') {
    next.analyses = {
      ...next.analyses,
      dependency: remote.analyses?.dependency || next.analyses?.dependency,
    };
    if (Array.isArray(remote.planning?.tasks) && remote.planning.tasks.length) {
      next.planning = {
        ...next.planning,
        tasks: remote.planning.tasks,
      };
    }
  } else if (job === 'architectureRiskAnalysis') {
    next.analyses = {
      ...next.analyses,
      architectureImpact:
        remote.analyses?.architectureImpact || next.analyses?.architectureImpact,
      risk: remote.analyses?.risk || next.analyses?.risk,
    };
  } else if (job === 'projectPlan') {
    next.planning = {
      ...next.planning,
      executionPlan: remote.planning?.executionPlan || null,
    };
  }
  next.jobs[job] = { ...next.jobs[job], ...remote.jobs?.[job] };
  return next;
}

function isDuplicateRemoteRun(container, job, runId) {
  const recorded =
    container?.phaseRuns?.[job]?.remoteRunId ||
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
  g4Understanding = null,
}) {
  const jobKey = String(jobRaw || '').trim();
  if (jobKey === 'phase_how' || jobKey === 'phase_what') {
    return applyRemotePhaseRunResult({
      runId,
      status,
      job: jobKey,
      projectId,
      packId,
      organizationId,
      snapshotId,
      result: {
        ...(result || {}),
        g4Understanding:
          g4Understanding ||
          result?.g4Understanding ||
          result?.result?.g4Understanding ||
          null,
      },
      error,
    });
  }
  const err = new Error(
    `Callback rejects per-job result "${jobKey}" — phase_what|phase_how only`
  );
  err.statusCode = 410;
  err.errorCode = 'JOB_BY_JOB_REMOVED';
  err.details = { job: jobKey };
  throw err;
}

async function applyRemotePhaseRunResult({
  runId,
  status,
  job,
  projectId,
  packId,
  organizationId,
  snapshotId,
  result,
  error,
}) {
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
    return { applied: false, stale: true, reason: 'snapshot_not_active', job, runId };
  }
  const phaseMeta = pack.aiAnalysis?.phaseRuns?.[job] || {};
  if (String(phaseMeta.remoteRunId || '') === String(runId) && phaseMeta.status !== 'pending') {
    return { applied: false, idempotent: true, job, runId };
  }
  let container = ensurePackContainer(pack);
  if (status === 'completed') {
    if (!result?.container) {
      const invalid = new Error('Completed phase result must include container');
      invalid.statusCode = 400;
      invalid.errorCode = 'REMOTE_RESULT_INVALID';
      throw invalid;
    }
    const {
      applyG4UnderstandingToContainer,
    } = require('../utils/aiAnalysis/whatG4Policy');
    const incoming = result.container;
    if (incoming.jobs != null) {
      /* strip — RULE-PO-03 */
    }
    if (incoming.planning) container.planning = incoming.planning;
    if (incoming.resource) container.resource = incoming.resource;
    if (incoming.analyses) {
      container.analyses = { ...(container.analyses || {}), ...incoming.analyses };
    }
    if (incoming.phaseRuns) {
      container.phaseRuns = { ...(container.phaseRuns || {}), ...incoming.phaseRuns };
    }
    const g4 =
      result.g4Understanding ||
      result.result?.g4Understanding ||
      incoming.analyses?.g4Understanding ||
      null;
    if (job === 'phase_what' && g4) {
      container = applyG4UnderstandingToContainer(container, g4, {
        remoteRunId: String(runId),
        snapshotId: String(snapshotId),
        status: 'ready',
        mode: 'g4',
        durationMs: result?.meta?.durationMs || result?.result?.durationMs || null,
      });
    } else {
      const feas =
        result?.feasibility ||
        result?.result?.feasibility ||
        incoming.analyses?.g13Feasibility ||
        null;
      container.phaseRuns = {
        ...(container.phaseRuns || {}),
        [job]: {
          status: 'ready',
          mode: job === 'phase_what' ? 'g4' : undefined,
          remoteRunId: String(runId),
          snapshotId: String(snapshotId),
          hitl: result?.result?.hitl || (job === 'phase_how' ? 'gate2' : 'gate1'),
          durationMs: result?.meta?.durationMs || result?.result?.durationMs || null,
          completedAt: new Date().toISOString(),
          error: null,
          ...(feas && typeof feas === 'object' ? { feasibility: feas } : {}),
        },
      };
      if (job === 'phase_how' && feas && typeof feas === 'object') {
        container.analyses = {
          ...(container.analyses || {}),
          g13Feasibility: feas,
        };
      }
    }
    pack.aiAnalysisStatus = 'ready';
  } else if (status === 'failed') {
    container.phaseRuns = {
      ...(container.phaseRuns || {}),
      [job]: {
        status: 'failed',
        remoteRunId: String(runId),
        snapshotId: String(snapshotId),
        error: error || { code: 'AGENT_PHASE_FAILED' },
      },
    };
    pack.aiAnalysisStatus = 'failed';
  } else {
    const invalid = new Error(`Invalid remote result status: ${status}`);
    invalid.statusCode = 400;
    invalid.errorCode = 'REMOTE_RESULT_STATUS_INVALID';
    throw invalid;
  }
  if (container.jobs != null) delete container.jobs;
  pack.aiAnalysis = container;
  pack.markModified('aiAnalysis');
  await pack.save();
  return { applied: true, idempotent: false, job, runId, status, phase: true };
}

/**
 * Start agentic HOW / WHAT phase run.
 * WHAT under WHAT_G4_ENABLED: remote G4 on ai-project-planning-service (202).
 * prepare_only stays local Stage1.
 */
async function startPhaseAiPlanningRun({
  userId,
  organizationId,
  packId,
  phase = 'how',
  force = false,
  mode = '',
  feedback = '',
}) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
  });

  const phaseJob = String(phase || 'how').trim().toLowerCase() === 'what' ? 'phase_what' : 'phase_how';
  const modeNorm = String(mode || '').trim().toLowerCase();
  const { isWhatG4Enabled } = require('../utils/aiAnalysis/whatG4Policy');

  // Phase 1 Stage 1 — input readiness (no G4 LLM).
  if (phaseJob === 'phase_what' && modeNorm === 'prepare_only') {
    const {
      runPhase1Stage1PrepareInput,
    } = require('./requirementPhase1Pipeline.service');
    return runPhase1Stage1PrepareInput({
      userId,
      organizationId,
      packId,
    });
  }

  // RULE-11: Phase1 intelligence always remote APS (no in-process Ollama / local WHAT jobs).
  // WHAT_G4_ENABLED=0 legacy paths are retired — fall through to S2S phase_what.
  if (phaseJob === 'phase_what' && !isWhatG4Enabled()) {
    console.warn(
      '[phase_what] WHAT_G4_ENABLED=0 ignored — routing remote APS (RULE-11)'
    );
  }

  // WHAT G4 remote (tools_propose / g4 / default) and HOW — S2S below
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  if (phaseJob === 'phase_how') {
    assertHowJobsRequireApprovedPack(pack, 'effortRoleAnalysis');
  }
  if (phaseJob === 'phase_what') {
    const st = String(pack.status || '');
    if (st !== 'draft' && st !== 'waiting_review') {
      assertPackReadyForAiAnalysis(pack.toObject());
    }
  } else {
    assertPackReadyForAiAnalysis(pack.toObject());
  }

  let snapshotId = pack.aiAnalysisActiveSnapshotId
    ? String(pack.aiAnalysisActiveSnapshotId)
    : null;
  let snapshotDoc = null;
  let packForPhase = pack;
  if (isSnapshotPipelineEnabled()) {
    const ensured = await ensureActiveAiAnalysisSnapshot({
      userId,
      organizationId,
      packId,
      pack,
    });
    packForPhase = ensured.pack || pack;
    snapshotDoc = ensured.snapshotDoc;
    assertSnapshotRequired(snapshotDoc);
    if (snapshotDoc) snapshotId = String(snapshotDoc._id);
  }
  if (!snapshotId) {
    const err = new Error('Active AI snapshot required for phase planning run');
    err.statusCode = 400;
    err.errorCode = 'SNAPSHOT_REQUIRED';
    throw err;
  }

  let container = ensurePackContainer(packForPhase);
  const existing = container.phaseRuns?.[phaseJob];
  if (
    !force &&
    existing?.status === 'pending' &&
    String(existing.remoteRunId || '')
  ) {
    return {
      accepted: true,
      remote: true,
      job: phaseJob,
      status: 'pending',
      runId: existing.remoteRunId,
      snapshotId,
      schemaVersion: container.schemaVersion,
      mode: phaseJob === 'phase_what' ? 'g4' : undefined,
    };
  }

  const expectedRunId = new RequirementPack.db.base.Types.ObjectId().toString();
  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    [phaseJob]: {
      status: 'pending',
      mode: phaseJob === 'phase_what' ? 'g4' : existing?.mode || undefined,
      remoteRunId: expectedRunId,
      snapshotId: String(snapshotId),
      startedAt: new Date().toISOString(),
      error: null,
    },
  };
  packForPhase.aiAnalysis = container;
  packForPhase.aiAnalysisStatus = 'pending';
  packForPhase.markModified('aiAnalysis');
  await packForPhase.save();

  const snapshotObject = snapshotDoc
    ? snapshotDoc.toObject
      ? snapshotDoc.toObject()
      : snapshotDoc
    : null;
  const packForJob = snapshotObject
    ? buildPackObjectFromSnapshot(packForPhase, snapshotObject, {})
    : packForPhase.toObject();

  const snapshotPayload = {
    ...(snapshotObject || {}),
    snapshotId,
    packId: String(packId),
    functionalRequirements:
      packForJob.functionalRequirements ||
      snapshotObject?.functionalRequirements ||
      [],
    overview: packForJob.overview || snapshotObject?.overview || {},
  };

  const { buildPhaseToolData } = require('../utils/aiAnalysis/pipeline/buildPhaseToolData');
  const toolData = buildPhaseToolData(snapshotObject, phaseJob);
  if (phaseJob === 'phase_how') {
    const n = Array.isArray(toolData.employees) ? toolData.employees.length : 0;
    console.info(`[phase_how] toolData employees=${n} snapshotId=${snapshotId}`);
  }

  let s2s;
  try {
    s2s = await aiProjectPlanningClient.startRun({
      runId: expectedRunId,
      projectId: packForPhase.projectId ? String(packForPhase.projectId) : null,
      packId: String(packId),
      organizationId: String(organizationId),
      snapshotId,
      approvedSrsVersion: packForPhase.approvedSrsVersion || packForPhase.version || null,
      snapshotPayloadRef: snapshotId,
      trigger: force ? 'force_rerun' : 'phase_run',
      initiatedBy: userId != null ? String(userId) : null,
      job: phaseJob,
      requestKey: `${String(packId)}:${phaseJob}:${snapshotId}`,
      input: {
        container,
        pack: packForJob,
        snapshot: snapshotPayload,
        toolData,
        inputFingerprint:
          toolData.inputFingerprint || `${phaseJob}:${snapshotId}`,
      },
    });
  } catch (err) {
    container.phaseRuns[phaseJob] = {
      ...container.phaseRuns[phaseJob],
      status: 'failed',
      error: { code: err.code || 'S2S_START_FAILED', message: err.message },
    };
    packForPhase.aiAnalysis = container;
    packForPhase.aiAnalysisStatus = 'failed';
    packForPhase.markModified('aiAnalysis');
    await packForPhase.save();
    throw err;
  }

  if (s2s.status !== 202) {
    const err = new Error(s2s.data?.message || 'Phase planning start rejected');
    err.statusCode = s2s.status >= 400 ? s2s.status : 502;
    err.errorCode = s2s.data?.errorCode || 'PHASE_PLANNING_START_FAILED';
    throw err;
  }

  return {
    accepted: true,
    remote: true,
    job: phaseJob,
    status: 'pending',
    runId: expectedRunId,
    snapshotId,
    schemaVersion: container.schemaVersion,
    httpStatus: 202,
    mode: phaseJob === 'phase_what' ? 'g4' : undefined,
  };
}

module.exports = {
  getAiAnalysisSummary,
  getAiAnalysisWizardJob,
  runAiAnalysisJob,
  startRemoteAiPlanningRun,
  startPhaseAiPlanningRun,
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
  // WHAT G4 policy helpers (tests / Gate1)
  ...(() => {
    try {
      return require('../utils/aiAnalysis/whatG4Policy');
    } catch {
      return {};
    }
  })(),
};

