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
  const { attachLiveRunToPackAiAnalysis } = require('../utils/aiAnalysis/attachLiveRun');
  const enriched = await attachLiveRunToPackAiAnalysis({
    aiAnalysis: container,
    aiAnalysisActiveSnapshotId: pack.aiAnalysisActiveSnapshotId,
  });
  return {
    ...summarizeAiAnalysis(enriched.aiAnalysis || container),
    snapshot: pack.aiAnalysisSnapshotMeta || null,
    liveRun: enriched.liveRun || null,
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
  action: actionRaw = '',
  note = '',
  reviewDecisions = null,
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

  const packForAuthz = await loadPackForAiAnalysis({ packId, organizationId });
  const projectId = packForAuthz?.projectId ? String(packForAuthz.projectId) : null;

  const {
    assertPhaseHowReadyForConfirm,
    markPhaseHowConfirmed,
    migrateJobsProjectionToPhaseRuns,
  } = require('../utils/aiAnalysis/phaseGate2');
  const {
    REVIEW_LANE,
    resolveGate2ReviewLane,
    assertActorMayActOnLane,
    stampGate2ReviewLane,
  } = require('../utils/aiAnalysis/gate2ReviewLane');
  const { assertGateStampSoD } = require('../utils/phase1GatePolicy');

  const pack = packForAuthz;
  let container = migrateJobsProjectionToPhaseRuns(ensurePackContainer(pack));
  assertPhaseHowReadyForConfirm(container);

  const lane = resolveGate2ReviewLane({ ...(pack.toObject?.() || pack), aiAnalysis: container });
  const action = String(actionRaw || '').trim().toLowerCase();

  if (!action && lane === REVIEW_LANE.DONE) {
    return {
      phase: 'how',
      job: 'phase_how',
      status: 'confirmed',
      reviewLane: REVIEW_LANE.DONE,
      schemaVersion: pack.aiAnalysis?.schemaVersion,
    };
  }

  // Legacy one-shot confirm (no action) while still on PM lane — wizard / older clients.
  // Explicit HITL always sends action=pm_submit | po_approve | po_reject.
  const effectiveAction =
    action || (lane === REVIEW_LANE.PO ? 'po_approve' : action ? action : '');

  if (!action && lane === REVIEW_LANE.PM) {
    // No sequential action: full confirm (compat). Prefer planning:po_review, else run-ai-planning.
    try {
      await assertPlanningGate2Permission({
        userId,
        projectId,
        permission: 'planning:po_review',
      });
    } catch (poErr) {
      if (poErr?.statusCode === 403) {
        await assertRequirementPermission({
          userId,
          organizationId,
          permission: 'requirement:run-ai-planning',
          projectId,
        });
      } else {
        throw poErr;
      }
    }
    container = markPhaseHowConfirmed(container);
    container = stampGate2ReviewLane(container, REVIEW_LANE.DONE, {
      confirmedBy: String(userId),
      confirmedAt: new Date().toISOString(),
    });
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();
    return {
      phase: 'how',
      job: 'phase_how',
      status: 'confirmed',
      reviewLane: REVIEW_LANE.DONE,
      schemaVersion: pack.aiAnalysis.schemaVersion,
    };
  }

  if (!effectiveAction) {
    const err = new Error('Gate 2 confirm cần action=pm_submit|po_approve|po_reject');
    err.statusCode = 400;
    err.errorCode = 'GATE2_ACTION_REQUIRED';
    throw err;
  }

  assertActorMayActOnLane(effectiveAction, lane);

  if (effectiveAction === 'pm_submit') {
    await assertPlanningGate2Permission({
      userId,
      projectId,
      permission: 'planning:pm_review',
    });
    const noteTrim = String(note || '').trim().slice(0, 2000);
    const decisions =
      reviewDecisions && typeof reviewDecisions === 'object' && !Array.isArray(reviewDecisions)
        ? reviewDecisions
        : {};
    const prevVersion = Number(container?.gate2?.reviewVersion) || 0;
    container = stampGate2ReviewLane(container, REVIEW_LANE.PO, {
      submittedBy: String(userId),
      submittedAt: new Date().toISOString(),
      reviewDecisions: decisions,
      reviewVersion: prevVersion + 1,
      reviewComplete: true,
      ...(noteTrim ? { submitNote: noteTrim } : {}),
      lastRejectReason: null,
      rejectedBy: null,
      rejectedAt: null,
    });
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
    return {
      phase: 'how',
      job: 'phase_how',
      status: String(container.phaseRuns?.phase_how?.status || 'ready'),
      reviewLane: REVIEW_LANE.PO,
      schemaVersion: pack.aiAnalysis.schemaVersion,
    };
  }

  if (effectiveAction === 'po_reject') {
    await assertPlanningGate2Permission({
      userId,
      projectId,
      permission: 'planning:po_review',
    });
    const reason = String(note || '').trim().slice(0, 2000);
    if (!reason) {
      const err = new Error('Cần lý do khi từ chối Gate 2');
      err.statusCode = 400;
      err.errorCode = 'GATE2_REJECT_REASON_REQUIRED';
      throw err;
    }
    const prior = pack.aiAnalysis?.gate2 || container.gate2 || {};
    assertGateStampSoD({
      actorUserId: userId,
      priorStamps: [{ userId: prior.submittedBy }],
    });
    container = stampGate2ReviewLane(container, REVIEW_LANE.PM, {
      lastRejectReason: reason,
      rejectedBy: String(userId),
      rejectedAt: new Date().toISOString(),
      submittedBy: null,
      submittedAt: null,
      reviewComplete: false,
    });

    // Loop2 selective replan (HARD-01 no Gate bypass; HARD-02 one path)
    const howRun =
      container.phaseRuns?.phase_how ||
      pack.aiAnalysis?.phaseRuns?.phase_how ||
      {};
    const remoteRunId = String(howRun.remoteRunId || howRun.runId || '').trim();
    let loop2 = { triggered: false };
    if (remoteRunId) {
      try {
        const fb = await aiProjectPlanningClient.submitFeedback(remoteRunId, {
          kind: 'planning_feedback',
          source: 'gate2',
          text: reason,
          note: reason,
        });
        loop2 = {
          triggered: fb.status >= 200 && fb.status < 300,
          httpStatus: fb.status,
          selectiveReplanTools: fb.data?.data?.selectiveReplanTools || null,
        };
        if (loop2.triggered) {
          container.phaseRuns = {
            ...(container.phaseRuns || {}),
            phase_how: {
              ...(howRun || {}),
              status: 'pending',
              hitl: 'gate2',
              loop2ReplanAt: new Date().toISOString(),
            },
          };
        }
      } catch (loopErr) {
        console.warn(
          '[gate2] Loop2 selective replan failed',
          loopErr?.message || loopErr
        );
        loop2 = { triggered: false, error: String(loopErr?.message || loopErr) };
      }
    }

    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();
    return {
      phase: 'how',
      job: 'phase_how',
      status: String(container.phaseRuns?.phase_how?.status || 'ready'),
      reviewLane: REVIEW_LANE.PM,
      schemaVersion: pack.aiAnalysis.schemaVersion,
      loop2,
    };
  }

  // po_approve
  await assertPlanningGate2Permission({
    userId,
    projectId,
    permission: 'planning:po_review',
  });
  const prior = pack.aiAnalysis?.gate2 || container.gate2 || {};
  assertGateStampSoD({
    actorUserId: userId,
    priorStamps: [{ userId: prior.submittedBy }],
  });
  const noteTrim = String(note || '').trim().slice(0, 2000);
  container = markPhaseHowConfirmed(container);
  container = stampGate2ReviewLane(container, REVIEW_LANE.DONE, {
    confirmedBy: String(userId),
    confirmedAt: new Date().toISOString(),
    ...(noteTrim ? { confirmNote: noteTrim } : {}),
  });
  pack.aiAnalysis = container;
  pack.aiAnalysisStatus = 'ready';
  pack.markModified('aiAnalysis');
  await pack.save();

  // Auto Phase 2 delivery: board tasks + deliveryPhase=development + P3/P4 skeleton
  let promote = null;
  let promoteError = null;
  try {
    const { autoPromoteAfterGate2PoApprove } = require('./projectPromoteFromGate2.service');
    promote = await autoPromoteAfterGate2PoApprove({
      userId,
      organizationId,
      packId,
    });
  } catch (promoteErr) {
    promoteError = {
      message: String(promoteErr?.message || promoteErr),
      statusCode: promoteErr?.statusCode || 500,
      errorCode: promoteErr?.errorCode || 'GATE2_PROMOTE_FAILED',
    };
    console.warn('[gate2] auto-promote after po_approve failed', {
      packId: String(packId),
      userId: String(userId),
      message: promoteError.message,
      errorCode: promoteError.errorCode,
    });
  }

  return {
    phase: 'how',
    job: 'phase_how',
    status: 'confirmed',
    reviewLane: REVIEW_LANE.DONE,
    schemaVersion: pack.aiAnalysis.schemaVersion,
    promoted: Boolean(promote?.promoted),
    promote: promote
      ? {
          promoted: true,
          projectId: String(promote.project?._id || promote.project?.projectId || ''),
          deliveryPhase: promote.project?.deliveryPhase || 'development',
          status: promote.project?.status || 'in_development',
          importStats: promote.importStats || null,
          phase34: promote.phase34 || null,
          defaultBoardId: promote.project?.defaultBoardId || null,
        }
      : null,
    promoteError,
    project: promote?.project || null,
    pack: promote?.pack || null,
  };
}

/**
 * Gate2 HITL — planning:pm_review / planning:po_review on linked project.
 */
async function assertPlanningGate2Permission({ userId, projectId, permission }) {
  const pid = String(projectId || '').trim();
  const perm = String(permission || '').trim();
  if (!pid) {
    const err = new Error('Gate 2 cần pack gắn projectId');
    err.statusCode = 409;
    err.errorCode = 'GATE2_PROJECT_REQUIRED';
    throw err;
  }
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  const resolved = await resolveUserProjectPermissions({ userId, projectId: pid });
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  if (!bypass && !hasPermission(resolved.permissions, perm)) {
    const err = new Error(
      perm === 'planning:pm_review'
        ? 'Chỉ Project Manager được gửi duyệt Gate 2'
        : 'Chỉ Product Owner được duyệt Gate 2'
    );
    err.statusCode = 403;
    err.errorCode = 'GATE2_PLANNING_FORBIDDEN';
    err.details = { permission: perm };
    throw err;
  }
  return resolved;
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
  proposalFragment = null,
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
        proposalFragment:
          proposalFragment ||
          result?.proposalFragment ||
          result?.result?.proposalFragment ||
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
    const stale = new Error(
      'Remote result snapshotId does not match active analysis snapshot'
    );
    stale.statusCode = 409;
    stale.errorCode = 'REMOTE_RESULT_SNAPSHOT_STALE';
    stale.details = {
      reason: 'snapshot_not_active',
      snapshotId: String(snapshotId),
      activeSnapshotId: String(pack.aiAnalysisActiveSnapshotId || ''),
      job,
      runId,
    };
    throw stale;
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
      applyRequirementProposalToContainer,
    } = require('../utils/aiAnalysis/whatRequirementPolicy');
    const incoming = result.container;
    if (incoming.jobs != null) {
      /* strip — RULE-PO-03 */
    }
    if (incoming.planning) container.planning = incoming.planning;
    if (incoming.resource) container.resource = incoming.resource;
    if (incoming.analyses) {
      const { g4Understanding: _dropG4, ...restAnalyses } = incoming.analyses;
      const prevG4 = container.analyses?.g4Understanding;
      container.analyses = { ...(container.analyses || {}), ...restAnalyses };
      // Never accept new g4Understanding writes; keep prior legacy only
      if (prevG4) container.analyses.g4Understanding = prevG4;
      else delete container.analyses.g4Understanding;
    }
    if (incoming.phaseRuns) {
      container.phaseRuns = { ...(container.phaseRuns || {}), ...incoming.phaseRuns };
    }
    const proposalFragment =
      result.proposalFragment || result.result?.proposalFragment || null;
    const g4 = result.g4Understanding || result.result?.g4Understanding || null;
    const fullSrsProposal =
      result.srsProposal ||
      result.result?.srsProposal ||
      incoming.analyses?.srsProposal ||
      null;
    const legacyPopulate =
      String(process.env.PHASE1_LEGACY_POPULATE_NON_FR || '').trim() === '1';
    if (job === 'phase_what' && (fullSrsProposal || proposalFragment || g4)) {
      try {
        container = applyRequirementProposalToContainer(
          container,
          fullSrsProposal || proposalFragment || g4,
          {
            remoteRunId: String(runId),
            snapshotId: String(snapshotId),
            status: 'ready',
            mode: 'requirement',
            generationId: String(runId),
            durationMs: result?.meta?.durationMs || result?.result?.durationMs || null,
            expectedReviewVersion: container.analyses?.srsProposal?.reviewVersion,
            pack,
            snapshot: pack.aiAnalysis?.intakeSnapshot || null,
            rawRecord: pack.aiAnalysis?.analyses?.customerRawRecord || null,
            // Hot path: APS delivers full srsProposal; populateNonFr only via legacy flag
            populateNonFr: legacyPopulate && !fullSrsProposal,
          }
        );
      } catch (casErr) {
        if (
          casErr.errorCode === 'STALE_GENERATION' ||
          casErr.errorCode === 'STALE_PROPOSAL_VERSION'
        ) {
          return { applied: false, stale: true, errorCode: casErr.errorCode, job, runId };
        }
        throw casErr;
      }
      // PLAN B: durable Loop1 reuse (survives parent G15 delete)
      const {
        attachLoop1ReuseToContainer,
      } = require('../utils/aiAnalysis/loop1ReuseArtifact');
      const loop1Reuse =
        result.loop1Reuse ||
        result.result?.loop1Reuse ||
        incoming.phaseRuns?.phase_what?.loop1Reuse ||
        null;
      container = attachLoop1ReuseToContainer(
        container,
        loop1Reuse,
        String(snapshotId)
      );
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
          mode: job === 'phase_what' ? 'requirement' : undefined,
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

  // WHAT done: write proposal sheets onto pack BEFORE Gate A (requirementTools) scoring
  if (status === 'completed' && job === 'phase_what') {
    try {
      const {
        materializeWhatToArtifacts,
        rebuildRequirementToolsAfterMaterialize,
      } = require('./whatRequirementPhase.service');
      await materializeWhatToArtifacts({ userId: null, pack });
      await rebuildRequirementToolsAfterMaterialize(pack);
    } catch (matErr) {
      // eslint-disable-next-line no-console
      console.warn('[phase_what] materialize/rebuild Gate A soft-fail', {
        packId: String(packId),
        message: matErr.message,
      });
    }
    // Sequential Gate1: AI ready → BA review lane
    try {
      const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
      const {
        REVIEW_LANE,
        stampGate1ReviewLane,
      } = require('../utils/srsProposal/gate1ReviewLane');
      let shell = ensureAiAnalysisContainer(pack.aiAnalysis);
      shell = stampGate1ReviewLane(shell, REVIEW_LANE.BA);
      pack.aiAnalysis = shell;
      pack.markModified('aiAnalysis');
      await pack.save();
    } catch (laneErr) {
      // eslint-disable-next-line no-console
      console.warn('[phase_what] stamp reviewLane=ba soft-fail', {
        packId: String(packId),
        message: laneErr.message,
      });
    }
  }

  if (status === 'completed' && pack.projectId) {
    const { notifyAiHitlGateReviewers } = require('../utils/phase1GatePolicy');
    if (job === 'phase_what') {
      void notifyAiHitlGateReviewers({
        projectId: String(pack.projectId),
        organizationId: pack.organizationId,
        actorUserId: null,
        packId: String(packId),
        nextPermission: 'requirement:submit',
        title: 'Gate 1 — AI đã xong, chờ BA xác nhận duyệt',
        content: 'Output sẵn trên Monitor; mở tab Duyệt để BA xác nhận.',
        kind: 'ai_hitl_gate1_ba',
      });
    } else if (job === 'phase_how') {
      void notifyAiHitlGateReviewers({
        projectId: String(pack.projectId),
        organizationId: pack.organizationId,
        actorUserId: null,
        packId: String(packId),
        nextPermission: 'requirement:run-ai-planning',
        title: 'Gate 2 — kế hoạch AI sẵn sàng duyệt',
        content: 'HOW đã xong — mở trang AI HITL để xác nhận Gate 2.',
        kind: 'ai_hitl_gate2',
      });
    }
  }

  return { applied: true, idempotent: false, job, runId, status, phase: true };
}

/**
 * Start agentic HOW / WHAT phase run.
 * WHAT under WHAT_G4_ENABLED: remote G4 on ai-project-planning-service (202).
 * prepare_only stays local Stage1.
 */
/**
 * RULE-R07: Data Gate HITL removed.
 * resume_data_gate (pass|reject) cancels legacy waiting_human:data_review and releases activeKey.
 * Caller should start a new WHAT phase-run afterward.
 */
async function resumeWhatDataGate({
  organizationId,
  packId,
  decision,
  runId,
}) {
  const decisionNorm = String(decision || '').trim().toLowerCase();
  if (decisionNorm !== 'pass' && decisionNorm !== 'reject') {
    const err = new Error('decision must be pass or reject');
    err.statusCode = 400;
    err.errorCode = 'DATA_GATE_DECISION_INVALID';
    throw err;
  }
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  const container = ensurePackContainer(pack);
  const phaseWhat = container.phaseRuns?.phase_what || {};
  const bound = String(phaseWhat.remoteRunId || '');
  if (!bound || bound !== String(runId || '').trim()) {
    const err = new Error('runId does not belong to this pack');
    err.statusCode = 409;
    err.errorCode = 'RUN_PACK_MISMATCH';
    throw err;
  }

  // Prefer cancel endpoint; fall back to resume decision that APS maps to cancel.
  let s2s = await aiProjectPlanningClient.cancelRun(bound);
  if (s2s.status < 200 || s2s.status >= 300) {
    s2s = await aiProjectPlanningClient.resumeRun(bound, { decision: decisionNorm });
  }
  if (s2s.status < 200 || s2s.status >= 300) {
    const err = new Error(s2s.data?.message || 'Legacy data-gate cleanup rejected');
    err.statusCode = s2s.status >= 400 ? s2s.status : 502;
    err.errorCode = s2s.data?.errorCode || 'DATA_GATE_CLEANUP_FAILED';
    throw err;
  }

  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    phase_what: {
      ...phaseWhat,
      status: 'cancelled',
      error: {
        code: 'data_gate_removed',
        message: 'Data Gate removed — start a new WHAT run',
      },
    },
  };
  pack.aiAnalysis = container;
  pack.aiAnalysisStatus = 'idle';
  pack.markModified('aiAnalysis');
  await pack.save();

  return {
    accepted: true,
    remote: true,
    job: 'phase_what',
    status: 'cancelled',
    runId: bound,
    decision: decisionNorm,
    legacyDataGateCleanup: true,
    httpStatus: 200,
    mode: 'g4',
  };
}

async function startPhaseAiPlanningRun({
  userId,
  organizationId,
  packId,
  phase = 'how',
  force = false,
  mode = '',
  feedback = '',
  action = '',
  decision = '',
  runId = '',
  idempotencyKey = '',
  parentRunId: parentRunIdHint = '',
  contextProjectId = null,
}) {
  const RequirementPack = require('../models/RequirementPack');
  const packMeta = await RequirementPack.findOne({
    _id: packId,
    organizationId,
    isActive: true,
  })
    .select('projectId')
    .lean();
  const rawPid = contextProjectId || packMeta?.projectId || null;
  let authzProjectId = null;
  if (rawPid != null && rawPid !== '') {
    if (typeof rawPid === 'object' && typeof rawPid.toHexString === 'function') {
      authzProjectId = rawPid.toHexString();
    } else if (typeof rawPid === 'object' && rawPid._id) {
      authzProjectId = String(rawPid._id);
    } else {
      const s = String(rawPid).trim();
      authzProjectId = s && s !== '[object Object]' ? s : null;
    }
  }

  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:run-ai-planning',
    projectId: authzProjectId,
  });

  if (String(action || '').trim().toLowerCase() === 'resume_data_gate') {
    return resumeWhatDataGate({
      organizationId,
      packId,
      decision,
      runId,
    });
  }

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

  if (phaseJob === 'phase_what') {
    const {
      ensureFormValidationOnPack,
      ensurePreparedIntakeForWhat,
    } = require('./whatRequirementPhase.service');
    const { assertG4CanStart, countValidFr } = require('../utils/requirement/workbookDiagnostic');

    await ensureFormValidationOnPack(packForPhase);
    if (typeof packForPhase.isModified === 'function' && packForPhase.isModified('aiAnalysis')) {
      await packForPhase.save();
    }

    // Self-heal: validFr=0 OR missing canonicalRaw on Customer Raw → re-prefill, then re-read before G4.
    const prepared = await ensurePreparedIntakeForWhat({
      pack: packForPhase,
      organizationId,
      packId,
    });
    if (prepared.didPrepare) {
      const reloaded = await RequirementPack.findOne({ _id: packId, organizationId });
      if (!reloaded) {
        const err = new Error('RequirementPack không tồn tại');
        err.statusCode = 404;
        err.errorCode = 'PACK_NOT_FOUND';
        throw err;
      }
      packForPhase = reloaded;
      if (isSnapshotPipelineEnabled()) {
        const refreshed = await ensureActiveAiAnalysisSnapshot({
          userId,
          organizationId,
          packId,
          pack: packForPhase,
          refreshOnFrDrift: true,
        });
        packForPhase = refreshed.pack || packForPhase;
        snapshotDoc = refreshed.snapshotDoc;
        assertSnapshotRequired(snapshotDoc);
        if (snapshotDoc) snapshotId = String(snapshotDoc._id);
      }
      // eslint-disable-next-line no-console
      console.info('[phase_what] post-prepare intake', {
        packId: String(packId),
        validFr: countValidFr(packForPhase),
        snapshotId: snapshotId || null,
      });
    }

    assertG4CanStart(packForPhase, snapshotDoc);
  }

  let container = ensurePackContainer(packForPhase);
  const existing = container.phaseRuns?.[phaseJob];
  const clientKey = String(idempotencyKey || '').trim().slice(0, 256);

  // Loop State S7: Idempotency-Key is authoritative even when force=true (double-click revise).
  if (
    clientKey &&
    String(existing?.clientIdempotencyKey || '') === clientKey &&
    String(existing?.remoteRunId || '')
  ) {
    return {
      accepted: true,
      remote: true,
      job: phaseJob,
      status: existing.status || 'pending',
      runId: existing.remoteRunId,
      parentRunId: existing.parentRunId || null,
      snapshotId: existing.snapshotId || snapshotId,
      schemaVersion: container.schemaVersion,
      mode: phaseJob === 'phase_what' ? 'g4' : undefined,
      idempotentReplay: true,
      httpStatus: 202,
    };
  }

  // Authority: current phase_what remoteRunId (FE parentRunId is hint only).
  const authorityParent = String(
    container.phaseRuns?.phase_what?.remoteRunId ||
      container.phaseRuns?.phase_what?.runId ||
      ''
  ).trim();
  const hintParent = String(parentRunIdHint || '').trim();
  if (hintParent && authorityParent && hintParent !== authorityParent) {
    const err = new Error(
      'parentRunId does not match current phase_what run for this pack'
    );
    err.statusCode = 409;
    err.errorCode = 'PARENT_RUN_MISMATCH';
    throw err;
  }
  const resolvedParentRunId =
    phaseJob === 'phase_what' && (force || feedback)
      ? authorityParent || hintParent || null
      : null;

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
      idempotentReplay: true,
      httpStatus: 202,
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
      ...(resolvedParentRunId ? { parentRunId: resolvedParentRunId } : {}),
      ...(clientKey ? { clientIdempotencyKey: clientKey } : {}),
    },
  };
  // HOW force re-run: reset Gate2 lane → PM must re-submit after new plan
  if (phaseJob === 'phase_how' && force) {
    const prevGate2 =
      container.gate2 && typeof container.gate2 === 'object' ? { ...container.gate2 } : {};
    container.gate2 = {
      ...prevGate2,
      reviewLane: 'pm',
      reviewLaneUpdatedAt: new Date().toISOString(),
      reviewDecisions: {},
      reviewComplete: false,
      submittedBy: null,
      submittedAt: null,
      resetAt: new Date().toISOString(),
      resetReason: 'phase_how_force_rerun',
      resetBy: userId != null ? String(userId) : null,
    };
    // eslint-disable-next-line no-console
    console.info('[phase_how] reset Gate2 review state on force re-run', {
      packId: String(packId),
    });
  }

  // WHAT re-run: drop prior Gate1 proposal so Review UI cannot show stale Duyệt data
  if (phaseJob === 'phase_what') {
    const analyses = { ...(container.analyses || {}) };
    delete analyses.g4Understanding;
    delete analyses.srsProposal;
    container.analyses = analyses;

    // Reset sequential Gate1 so BA must confirm again after AI completes (PO-triggered re-run)
    const prevStatus = String(packForPhase.status || '').trim().toLowerCase();
    if (prevStatus === 'under_review' || prevStatus === 'rejected') {
      packForPhase.status = 'draft';
    }
    packForPhase.submittedBy = undefined;
    packForPhase.submittedAt = undefined;
    if (prevStatus === 'under_review') {
      packForPhase.approvedBy = undefined;
      packForPhase.approvedAt = undefined;
    }

    const prevGate1 = container.gate1 && typeof container.gate1 === 'object' ? { ...container.gate1 } : {};
    const withdrawId = prevGate1.activeSubmissionId || null;
    delete prevGate1.reviewLane;
    delete prevGate1.reviewLaneUpdatedAt;
    delete prevGate1.approvedAgainstSubmissionId;
    delete prevGate1.approvedManifestHash;
    delete prevGate1.poReapprovalRequired;
    delete prevGate1.poApprovedAt;
    delete prevGate1.poApprovedBy;
    container.gate1 = {
      ...prevGate1,
      activeSubmissionId: null,
      activeReviewId: null,
      resetAt: new Date().toISOString(),
      resetReason: force ? 'phase_what_force_rerun' : 'phase_what_rerun',
      resetBy: userId != null ? String(userId) : null,
    };

    if (withdrawId) {
      try {
        const { withdrawActiveSubmission } = require('../utils/srsProposal/gate1SubmitTrust');
        await withdrawActiveSubmission({
          pack: {
            _id: packForPhase._id,
            aiAnalysis: { gate1: { activeSubmissionId: withdrawId } },
          },
          organizationId,
          userId,
          withdrawSubmissionId: withdrawId,
        });
      } catch (withdrawErr) {
        // eslint-disable-next-line no-console
        console.warn('[phase_what] withdraw GateSubmission on re-run soft-fail', {
          packId: String(packId),
          message: withdrawErr.message,
        });
      }
    }

    // eslint-disable-next-line no-console
    console.info('[phase_what] reset Gate1 review state on re-run', {
      packId: String(packId),
      prevStatus,
      nextStatus: packForPhase.status,
      withdrewSubmission: Boolean(withdrawId),
    });
  }
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

  const snapFr = Array.isArray(snapshotObject?.projected?.srs?.functionalRequirements)
    ? snapshotObject.projected.srs.functionalRequirements.length
    : 0;
  const snapNfr = Array.isArray(snapshotObject?.projected?.srs?.nonFunctionalRequirements)
    ? snapshotObject.projected.srs.nonFunctionalRequirements.length
    : 0;
  const liveFr = Array.isArray(packForPhase.functionalRequirements)
    ? packForPhase.functionalRequirements.length
    : 0;
  const liveNfr = Array.isArray(packForPhase.nonFunctionalRequirements)
    ? packForPhase.nonFunctionalRequirements.length
    : 0;
  const jobFr = Array.isArray(packForJob.functionalRequirements)
    ? packForJob.functionalRequirements.length
    : 0;
  const jobNfr = Array.isArray(packForJob.nonFunctionalRequirements)
    ? packForJob.nonFunctionalRequirements.length
    : 0;
  // eslint-disable-next-line no-console
  console.info(
    '[phase_what] intake counts fr=%d nfr=%d snapFr=%d snapNfr=%d jobFr=%d jobNfr=%d',
    liveFr,
    liveNfr,
    snapFr,
    snapNfr,
    jobFr,
    jobNfr
  );

  const { buildPhaseToolData } = require('../utils/aiAnalysis/pipeline/buildPhaseToolData');
  const { PIPELINE_VERSION } = require('../utils/aiAnalysis/pipeline/pipelineConstants');
  // HOW: still pin toolData employees at start for observability; APS can also hydrate from snapshot.
  const toolData = buildPhaseToolData(snapshotObject, phaseJob);
  if (phaseJob === 'phase_how') {
    const n = Array.isArray(toolData.employees) ? toolData.employees.length : 0;
    console.info(`[phase_how] toolData employees=${n} snapshotId=${snapshotId}`);
  }

  const { sanitizePhase1Feedback } = require('../utils/aiAnalysis/phase1KnowledgeContext');
  const feedbackClean = sanitizePhase1Feedback(feedback);
  const rejectReason = String(packForPhase.rejectionReason || '').trim();
  const loop1Text =
    feedbackClean ||
    (phaseJob === 'phase_what' && force && rejectReason ? rejectReason.slice(0, 2000) : '');

  // RULE-DL-07: new runs forbid embedded input.snapshot / input.pack — APS hydrates via S2S
  const slimInput = {
    container,
    toolData: phaseJob === 'phase_how' ? toolData : {},
    packContentHash:
      snapshotObject?.packContentHash ||
      packForPhase.aiAnalysisSnapshotMeta?.packContentHash ||
      null,
    pipelineVersion: snapshotObject?.pipelineVersion ?? PIPELINE_VERSION,
    inputFingerprint:
      toolData.inputFingerprint || `${phaseJob}:${snapshotId}`,
    ...(loop1Text
      ? (() => {
          const {
            readLoop1ReuseFromPack,
            toLoop1G4OptsSeed,
          } = require('../utils/aiAnalysis/loop1ReuseArtifact');
          const reuse = readLoop1ReuseFromPack(
            packForPhase.aiAnalysis,
            snapshotId
          );
          const reuseSeed = toLoop1G4OptsSeed(reuse) || {};
          return {
            feedback: loop1Text,
            humanFeedback: {
              kind: 'requirement_feedback',
              source: 'gate1',
              text: loop1Text,
            },
            g4Opts: {
              loop1Reenter: true,
              ...reuseSeed,
            },
          };
        })()
      : {}),
  };
  if (slimInput.snapshot != null || slimInput.pack != null) {
    delete slimInput.snapshot;
    delete slimInput.pack;
  }

  let s2s;
  try {
    s2s = await aiProjectPlanningClient.startRun({
      runId: expectedRunId,
      projectId: packForPhase.projectId ? String(packForPhase.projectId) : null,
      packId: String(packId),
      organizationId: String(organizationId),
      snapshotId,
      parentRunId: resolvedParentRunId || undefined,
      approvedSrsVersion: packForPhase.approvedSrsVersion || packForPhase.version || null,
      snapshotPayloadRef: snapshotId,
      trigger: force ? 'force_rerun' : 'phase_run',
      initiatedBy: userId != null ? String(userId) : null,
      job: phaseJob,
      requestKey:
        clientKey ||
        (resolvedParentRunId
          ? `${String(packId)}:${phaseJob}:loop1_revise:${resolvedParentRunId}`
          : `${String(packId)}:${phaseJob}:${snapshotId}`),
      idempotencyKey:
        clientKey ||
        (resolvedParentRunId
          ? `${String(packId)}:${phaseJob}:loop1_revise:${resolvedParentRunId}`
          : undefined),
      input: slimInput,
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
    parentRunId: resolvedParentRunId || null,
    generationId: expectedRunId,
    snapshotId,
    schemaVersion: container.schemaVersion,
    httpStatus: 202,
    mode: phaseJob === 'phase_what' ? 'g4' : undefined,
    ...(loop1Text ? { feedbackApplied: true } : {}),
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

