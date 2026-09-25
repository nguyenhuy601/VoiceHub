/**
 * AI Analysis Jobs — Blueprint container (schema v2) projection ids.
 * Execute SoT is phase_what / phase_how (not public job-by-job run).
 * Ids remain for container.jobs read-model, Sheet11 export, Gate2 projectPlan.
 */

const AI_ANALYSIS_SCHEMA_VERSION = 2;

/** Ordered user jobs — each requires previous confirmed before run. */
const AI_ANALYSIS_USER_JOBS = Object.freeze([
  'hierarchyDecomposition',
  'requirementAnalysis',
  'capabilityAnalysis',
  'requirementInsights',
  'wbsGeneration',
  'dependencyAnalysis',
  'architectureRiskAnalysis',
  'effortRoleAnalysis',
  'sequencingCpm',
  'employeeMatching',
  'scheduleCapacity',
  'projectPlan',
]);

/** ADR 0003 — WHAT jobs (Requirement Analysis path)
 * Under WHAT_G4_ENABLED (default): shells only — confirmed at Gate1 after remote G4.
 * Do not run these via runAiAnalysisJob; use phase_what G4 instead.
 */
const AI_ANALYSIS_WHAT_JOBS = Object.freeze([
  'hierarchyDecomposition',
  'requirementAnalysis',
  'capabilityAnalysis',
  'requirementInsights',
]);

/** ADR 0003 — HOW / Planning jobs (require pack approved) */
const AI_ANALYSIS_HOW_JOBS = Object.freeze([
  'wbsGeneration',
  'dependencyAnalysis',
  'architectureRiskAnalysis',
  'effortRoleAnalysis',
  'sequencingCpm',
  'employeeMatching',
  'scheduleCapacity',
  'projectPlan',
]);

function isAiAnalysisWhatJob(job) {
  return AI_ANALYSIS_WHAT_JOBS.includes(String(job || '').trim());
}

function isAiAnalysisHowJob(job) {
  return AI_ANALYSIS_HOW_JOBS.includes(String(job || '').trim());
}

/** Extra job shells — not runnable via run API. */
const AI_ANALYSIS_POST_JOBS = Object.freeze(['final']);

const AI_ANALYSIS_ALL_JOB_KEYS = Object.freeze([
  ...AI_ANALYSIS_USER_JOBS,
  ...AI_ANALYSIS_POST_JOBS,
]);

const AI_ANALYSIS_JOB_STATUS = Object.freeze([
  'empty',
  'pending',
  'ready',
  'confirmed',
  'stale',
  'failed',
]);

const AI_ANALYSIS_SECTION_KEYS = Object.freeze([
  'hierarchy',
  'capability',
  'data',
  'dependency',
  'gap',
  'architectureImpact',
  'risk',
]);

/** Job → analyses / planning / resource shells touched. */
const AI_ANALYSIS_JOB_OUTPUT_MAP = Object.freeze({
  hierarchyDecomposition: { analyses: ['hierarchy'] },
  requirementAnalysis: { analyses: ['data', 'gap'] },
  capabilityAnalysis: { analyses: ['capability'] },
  requirementInsights: { analyses: ['requirementInsights', 'proposedSrs', 'preApproval'] },

  wbsGeneration: { planning: ['wbs', 'tasks'] },
  dependencyAnalysis: { analyses: ['dependency'] },
  architectureRiskAnalysis: {
    analyses: ['architectureImpact', 'risk'],
  },
  effortRoleAnalysis: { planning: ['roles', 'skills', 'effort'] },
  sequencingCpm: {
    planning: ['sequence', 'theoreticalCpm', 'criticalWorkIds'],
  },
  employeeMatching: { resource: ['fte', 'recommendations'] },
  scheduleCapacity: {
    resource: ['assignments', 'assignmentsMeta', 'schedule'],
    planning: ['completion', 'tasks'],
  },
  projectPlan: { planning: ['executionPlan'] },
});

/** Legacy v1 job ids — rejected by parseJobId; used only by migrate. */
const AI_ANALYSIS_LEGACY_JOB_IDS = Object.freeze([
  'roleSkillAnalysis',
  'employeeAssignment',
]);

function isAiAnalysisUserJob(job) {
  return AI_ANALYSIS_USER_JOBS.includes(String(job || '').trim());
}

function parseJobId(raw) {
  const job = String(raw || '').trim();
  if (!job) {
    const err = new Error('job is required');
    err.statusCode = 400;
    err.errorCode = 'AI_ANALYSIS_JOB_REQUIRED';
    throw err;
  }
  if (job === 'all' || job.includes(',')) {
    const err = new Error('Only one job per request — job=all / multi-job forbidden');
    err.statusCode = 400;
    err.errorCode = 'AI_ANALYSIS_MULTI_JOB_FORBIDDEN';
    throw err;
  }
  if (!isAiAnalysisUserJob(job)) {
    const err = new Error(
      `Invalid job "${job}" — must be one of the ${AI_ANALYSIS_USER_JOBS.length} AI Analysis user jobs`
    );
    err.statusCode = 400;
    err.errorCode = 'AI_ANALYSIS_INVALID_JOB';
    throw err;
  }
  return job;
}

function previousUserJob(job) {
  const id = String(job || '').trim();
  const idx = AI_ANALYSIS_USER_JOBS.indexOf(id);
  if (idx <= 0) return null;
  return AI_ANALYSIS_USER_JOBS[idx - 1];
}

function userJobsAfter(job) {
  const id = String(job || '').trim();
  const idx = AI_ANALYSIS_USER_JOBS.indexOf(id);
  if (idx < 0) return [];
  return AI_ANALYSIS_USER_JOBS.slice(idx + 1);
}

module.exports = {
  AI_ANALYSIS_SCHEMA_VERSION,
  AI_ANALYSIS_USER_JOBS,
  AI_ANALYSIS_WHAT_JOBS,
  AI_ANALYSIS_HOW_JOBS,
  AI_ANALYSIS_POST_JOBS,
  AI_ANALYSIS_ALL_JOB_KEYS,
  AI_ANALYSIS_JOB_STATUS,
  AI_ANALYSIS_SECTION_KEYS,
  AI_ANALYSIS_JOB_OUTPUT_MAP,
  AI_ANALYSIS_LEGACY_JOB_IDS,
  isAiAnalysisUserJob,
  isAiAnalysisWhatJob,
  isAiAnalysisHowJob,
  parseJobId,
  previousUserJob,
  userJobsAfter,
};
