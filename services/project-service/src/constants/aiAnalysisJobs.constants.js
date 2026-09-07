/**
 * AI Analysis Jobs — Blueprint container (W2).
 * Six user-confirm jobs + projectPlan/final shells (W9).
 */

const AI_ANALYSIS_SCHEMA_VERSION = 1;

/** Ordered user jobs — each requires previous confirmed before run. */
const AI_ANALYSIS_USER_JOBS = Object.freeze([
  'requirementAnalysis',
  'wbsGeneration',
  'roleSkillAnalysis',
  'architectureRiskAnalysis',
  'employeeMatching',
  'employeeAssignment',
]);

/** Extra job shells (after Job6) — not runnable via W2 run API. */
const AI_ANALYSIS_POST_JOBS = Object.freeze(['projectPlan', 'final']);

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
  'capability',
  'data',
  'dependency',
  'gap',
  'architectureImpact',
  'risk',
]);

/** Job → analyses / planning / resource shells touched (W2 ownership map). */
const AI_ANALYSIS_JOB_OUTPUT_MAP = Object.freeze({
  requirementAnalysis: { analyses: ['data', 'gap'] },
  wbsGeneration: { analyses: ['capability'], planning: ['wbs', 'tasks'] },
  roleSkillAnalysis: { planning: ['roles', 'skills', 'effort'] },
  architectureRiskAnalysis: {
    analyses: ['architectureImpact', 'dependency', 'risk'],
  },
  employeeMatching: { resource: ['fte', 'recommendations'] },
  employeeAssignment: { resource: ['assignments'] },
});

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
      `Invalid job "${job}" — must be one of the 6 AI Analysis user jobs`
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
  AI_ANALYSIS_POST_JOBS,
  AI_ANALYSIS_ALL_JOB_KEYS,
  AI_ANALYSIS_JOB_STATUS,
  AI_ANALYSIS_SECTION_KEYS,
  AI_ANALYSIS_JOB_OUTPUT_MAP,
  isAiAnalysisUserJob,
  parseJobId,
  previousUserJob,
  userJobsAfter,
};
