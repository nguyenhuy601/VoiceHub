/**
 * AI Analysis job orchestration (W2) — container + run/confirm gates.
 * LLM bodies filled in W3–W7b; W2 persists stubs + gates only.
 */

const RequirementPack = require('../models/RequirementPack');
const { AI_PLANNING_ALLOWED_STATUSES } = require('../constants/requirementLifecycle');
const { assertPackReadyForAiAnalysis } = require('../utils/requirementPlanningReadiness');
const {
  createEmptyAiAnalysisContainer,
  ensureAiAnalysisContainer,
  assertSchemaVersionPresent,
  assertPreviousJobConfirmed,
  summarizeAiAnalysis,
  buildWizardJobDto,
  markJobReadyStub,
  markJobConfirmed,
  applyJobEdits,
  getJobStatus,
} = require('../utils/aiAnalysisContainer');
const { parseJobId } = require('../constants/aiAnalysisJobs.constants');
const { warmOllamaModel } = require('../utils/ollamaClient');
const { buildAiAnalysisSheet11Buffer } = require('../utils/aiAnalysisSheet11Export');
const {
  runCapabilityAnalysis,
  applyCapabilityToContainer,
} = require('../utils/aiAnalysisCapability');
const {
  runDataAnalysis,
  applyDataToContainer,
} = require('../utils/aiAnalysisData');
const {
  runDependencyAnalysis,
  applyDependencyToContainer,
} = require('../utils/aiAnalysisDependency');
const {
  runArchitectureImpactAnalysis,
  applyArchitectureImpactToContainer,
} = require('../utils/aiAnalysisArchitectureImpact');
const {
  runRiskAnalysis,
  applyRiskToContainer,
} = require('../utils/aiAnalysisRisk');
const {
  runGapAnalysis,
  applyGapToContainer,
} = require('../utils/aiAnalysisGap');
const {
  runWbsTaskGeneration,
  applyWbsToContainer,
} = require('../utils/aiAnalysisWbs');
const {
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
} = require('../utils/aiAnalysisRoleSkill');
const {
  runEffortEngine,
  applyEffortToContainer,
} = require('../utils/aiAnalysisEffort');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../utils/aiAnalysisMatching');
const {
  runEmployeeAssignment,
  applyAssignmentToContainer,
  validateAssignmentsAgainstShortlist,
} = require('../utils/aiAnalysisAssignment');
const { assertRequirementPermission } = require('./requirementAccess.service');
const {
  failStalePendingAiAnalysisJobs,
  shouldSkipRerunBecauseReady,
} = require('../utils/aiAnalysisStaleGc');

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
  if (!pack.aiAnalysis || typeof pack.aiAnalysis !== 'object') {
    pack.aiAnalysis = createEmptyAiAnalysisContainer();
  } else {
    pack.aiAnalysis = ensureAiAnalysisContainer(pack.aiAnalysis);
  }
  assertSchemaVersionPresent(pack.aiAnalysis);
  return pack.aiAnalysis;
}

async function getAiAnalysisSummary({ userId, organizationId, packId }) {
  await assertRequirementPermission({
    userId,
    organizationId,
    permission: 'requirement:view',
  });
  const pack = await loadPackForAiAnalysis({ packId, organizationId });
  let container = ensureAiAnalysisContainer(pack.aiAnalysis);
  const gc = failStalePendingAiAnalysisJobs(container);
  if (gc.changed) {
    pack.aiAnalysis = gc.container;
    pack.markModified('aiAnalysis');
    await pack.save();
    container = gc.container;
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
  return buildWizardJobDto(pack.aiAnalysis, job);
}

/**
 * Run one AI Analysis job.
 * Job1 requirementAnalysis: W3b data + W3d gap.
 * Job2 wbsGeneration: W3a capability runner (W5 tasks still stub until W5).
 * Job4 architectureRiskAnalysis: W3c dependency + W3e architecture + W3f risk.
 * Other jobs: stub ready (filled in later waves).
 */
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

  if (shouldSkipRerunBecauseReady(container, job, { force: Boolean(force) })) {
    return {
      job,
      status: getJobStatus(container, job),
      schemaVersion: container.schemaVersion,
      skipped: true,
      reason: 'already_ready',
    };
  }

  const runStartedAt = Date.now();
  const elapsedDurationMs = () => Math.max(0, Date.now() - runStartedAt);

  // Load model into RAM before chunks (non-fatal on failure).
  await warmOllamaModel();

  if (job === 'requirementAnalysis') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.requirementAnalysis = {
      ...container.jobs.requirementAnalysis,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();

    const packObj = pack.toObject();
    // Snapshot W0 issues — gap must never overwrite them
    const importIssuesBefore = pack.importIssues;

    // Sequential on single Ollama — avoid cold-load contention.
    const dataResult = await runDataAnalysis(packObj);
    const gapResult = await runGapAnalysis(packObj);
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    container = applyDataToContainer(container, dataResult);
    container = applyGapToContainer(container, gapResult);

    const models = [dataResult.model, gapResult.model].filter(Boolean);
    const llmCalls =
      (dataResult.meta?.llmCalls ?? 0) + (gapResult.meta?.llmCalls ?? 0);
    const partial = Boolean(dataResult.meta?.partial || gapResult.meta?.partial);
    const jobError = dataResult.meta?.error || gapResult.meta?.error || null;

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
    // Ensure W0 validation issues untouched
    if (importIssuesBefore !== undefined) {
      pack.importIssues = importIssuesBefore;
    }
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls,
      partial,
      durationMs: pack.aiAnalysis.jobs.requirementAnalysis.durationMs,
      entityCount: (dataResult.entities || []).length,
      dataFlowCount: (dataResult.dataFlows || []).length,
      gapCount: (gapResult.items || []).length,
      severityCounts: gapResult.meta?.severityCounts || null,
      hardBlockNextJob: Boolean(gapResult.meta?.hardBlockNextJob),
    };
  }

  if (job === 'wbsGeneration') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.wbsGeneration = {
      ...container.jobs.wbsGeneration,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();

    const packObj = pack.toObject();
    const capabilityResult = await runCapabilityAnalysis(packObj);
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    container = applyCapabilityToContainer(container, capabilityResult);
    const wbsResult = await runWbsTaskGeneration(packObj, container, {
      capabilities: capabilityResult.items,
    });
    container = applyWbsToContainer(container, wbsResult);

    const llmCalls =
      (capabilityResult.meta?.llmCalls ?? 0) + (wbsResult.meta?.llmCalls ?? 0);
    const partial = Boolean(capabilityResult.meta?.partial || wbsResult.meta?.partial);
    container.jobs.wbsGeneration = {
      ...container.jobs.wbsGeneration,
      status: 'ready',
      model: capabilityResult.model || wbsResult.model || null,
      generatedAt: wbsResult.generatedAt || capabilityResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: capabilityResult.meta?.error || wbsResult.meta?.error || null,
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
      durationMs: pack.aiAnalysis.jobs.wbsGeneration.durationMs,
      capabilityCount: (capabilityResult.items || []).length,
      taskCount: (wbsResult.tasks || []).length,
    };
  }

  if (job === 'roleSkillAnalysis') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.roleSkillAnalysis = {
      ...container.jobs.roleSkillAnalysis,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const roleSkillResult = runRoleSkillPlanning(packObj, container);
    container = applyRoleSkillToContainer(container, roleSkillResult);
    const effortResult = runEffortEngine(container);
    container = applyEffortToContainer(container, effortResult);

    container.jobs.roleSkillAnalysis = {
      ...container.jobs.roleSkillAnalysis,
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
      durationMs: pack.aiAnalysis.jobs.roleSkillAnalysis.durationMs,
      roleCount: (roleSkillResult.roles || []).length,
      skillCount: (roleSkillResult.skills || []).length,
      estimatedHoursTotal: effortResult.effort?.estimatedHoursTotal ?? 0,
      hasProjectManager: Boolean(roleSkillResult.meta?.hasProjectManager),
    };
  }

  if (job === 'architectureRiskAnalysis') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.architectureRiskAnalysis = {
      ...container.jobs.architectureRiskAnalysis,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();

    const packObj = pack.toObject();
    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    // Sequential on single Ollama — avoid cold-load contention.
    const depResult = await runDependencyAnalysis(packObj, container);
    const archResult = await runArchitectureImpactAnalysis(packObj, container);
    container = markJobReadyStub(container, job);
    container = applyDependencyToContainer(container, depResult);
    container = applyArchitectureImpactToContainer(container, archResult);

    // Risk consumes prior analyses + freshly computed dep/arch signals
    const riskResult = await runRiskAnalysis(packObj, container);
    container = applyRiskToContainer(container, riskResult);

    const models = [depResult.model, archResult.model, riskResult.model].filter(Boolean);
    const llmCalls =
      (depResult.meta?.llmCalls ?? 0) +
      (archResult.meta?.llmCalls ?? 0) +
      (riskResult.meta?.llmCalls ?? 0);
    const partial = Boolean(
      depResult.meta?.partial || archResult.meta?.partial || riskResult.meta?.partial
    );
    const jobError =
      depResult.meta?.error || archResult.meta?.error || riskResult.meta?.error || null;

    container.jobs.architectureRiskAnalysis = {
      ...container.jobs.architectureRiskAnalysis,
      status: 'ready',
      model: models[0] || null,
      generatedAt:
        riskResult.generatedAt || archResult.generatedAt || depResult.generatedAt,
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
      durationMs: pack.aiAnalysis.jobs.architectureRiskAnalysis.durationMs,
      edgeCount: (depResult.edges || []).length,
      orderHintCount: (depResult.orderHint || []).length,
      cycleBroken: (depResult.meta?.cycleBroken || []).length,
      architectureImpactCount: (archResult.items || []).length,
      chainCount: (archResult.chains || []).length,
      riskCount: (riskResult.items || []).length,
      riskBandCounts: riskResult.meta?.bandCounts || null,
      hardBlockNextJob: Boolean(riskResult.meta?.hardBlockNextJob),
    };
  }

  if (job === 'employeeMatching') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.employeeMatching = {
      ...container.jobs.employeeMatching,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
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
      assignmentCount: 0,
    };
  }

  if (job === 'employeeAssignment') {
    pack.aiAnalysisStatus = 'pending';
    container = markJobReadyStub(container, job);
    container.jobs.employeeAssignment = {
      ...container.jobs.employeeAssignment,
      status: 'pending',
      error: null,
    };
    pack.aiAnalysis = container;
    pack.markModified('aiAnalysis');
    await pack.save();

    container = ensureAiAnalysisContainer(pack.aiAnalysis);
    container = markJobReadyStub(container, job);
    const assignResult = await runEmployeeAssignment(pack.toObject(), container);
    container = applyAssignmentToContainer(container, assignResult);
    container.jobs.employeeAssignment = {
      ...container.jobs.employeeAssignment,
      status: 'ready',
      model: assignResult.model || null,
      generatedAt: assignResult.generatedAt,
      confirmedAt: null,
      durationMs: elapsedDurationMs(),
      error: assignResult.meta?.error || null,
    };
    pack.aiAnalysis = container;
    pack.aiAnalysisStatus = 'ready';
    pack.markModified('aiAnalysis');
    await pack.save();

    return {
      job,
      status: 'ready',
      schemaVersion: pack.aiAnalysis.schemaVersion,
      llmCalls: assignResult.meta?.llmCalls ?? 0,
      partial: Boolean(assignResult.meta?.partial),
      durationMs: pack.aiAnalysis.jobs.employeeAssignment.durationMs,
      assignmentCount: (assignResult.assignments || []).length,
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

  if (job === 'employeeAssignment' && edits?.resource?.assignments) {
    const { valid, rejected } = validateAssignmentsAgainstShortlist(
      edits.resource.assignments,
      container.resource?.recommendations || []
    );
    if (rejected.length) {
      const err = new Error('Assignment userId must be in Job5 shortlist');
      err.statusCode = 400;
      err.errorCode = 'AI_ANALYSIS_ASSIGN_NOT_IN_SHORTLIST';
      err.details = { rejected };
      throw err;
    }
    container.resource.assignments = valid;
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
  const buffer = await buildAiAnalysisSheet11Buffer(pack.aiAnalysis);
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
  // W9 helpers re-export
  assertBlueprintReadyForProjectCreate: (...args) =>
    require('../utils/aiAnalysisBlueprintImport').assertBlueprintReadyForProjectCreate(...args),
  mapBlueprintTasksToImportPlan: (...args) =>
    require('../utils/aiAnalysisBlueprintImport').mapBlueprintTasksToImportPlan(...args),
};
