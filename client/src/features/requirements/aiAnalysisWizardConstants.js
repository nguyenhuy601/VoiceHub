/**
 * W8 — AI Analysis Blueprint wizard constants (6 jobs).
 */

export const AI_ANALYSIS_JOBS = Object.freeze([
  {
    id: 'requirementAnalysis',
    labelKey: 'requirements.aiJobRequirementAnalysis',
    descriptionKey: 'requirements.aiJobRequirementAnalysisDesc',
    previewKeys: ['analyses.data', 'analyses.gap'],
  },
  {
    id: 'wbsGeneration',
    labelKey: 'requirements.aiJobWbsGeneration',
    descriptionKey: 'requirements.aiJobWbsGenerationDesc',
    previewKeys: ['analyses.capability', 'planning.tasks'],
  },
  {
    id: 'roleSkillAnalysis',
    labelKey: 'requirements.aiJobRoleSkill',
    descriptionKey: 'requirements.aiJobRoleSkillDesc',
    previewKeys: ['planning.roles', 'planning.skills', 'planning.effort'],
  },
  {
    id: 'architectureRiskAnalysis',
    labelKey: 'requirements.aiJobArchitectureRisk',
    descriptionKey: 'requirements.aiJobArchitectureRiskDesc',
    previewKeys: ['analyses.architectureImpact', 'analyses.dependency', 'analyses.risk'],
  },
  {
    id: 'employeeMatching',
    labelKey: 'requirements.aiJobMatching',
    descriptionKey: 'requirements.aiJobMatchingDesc',
    previewKeys: ['resource.fte', 'resource.recommendations'],
  },
  {
    id: 'employeeAssignment',
    labelKey: 'requirements.aiJobAssignment',
    descriptionKey: 'requirements.aiJobAssignmentDesc',
    previewKeys: ['resource.assignments'],
  },
]);

/** UI statuses — never surface backend "empty". */
export const AI_ANALYSIS_UI_STATUS = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  NEEDS_REVIEW: 'needs_review',
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  LOCKED: 'locked',
  FAILED: 'failed',
});

export function jobIndex(jobId) {
  return AI_ANALYSIS_JOBS.findIndex((j) => j.id === jobId);
}

export function previousJobId(jobId) {
  const idx = jobIndex(jobId);
  if (idx <= 0) return null;
  return AI_ANALYSIS_JOBS[idx - 1].id;
}

export function canRunJob(summaryJobs, jobId) {
  const idx = jobIndex(jobId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const prev = AI_ANALYSIS_JOBS[idx - 1].id;
  return String(summaryJobs?.[prev]?.status || '') === 'confirmed';
}

/** Index of first job that is not confirmed (-1 if all confirmed). */
export function firstIncompleteJobIndex(summaryJobs) {
  for (let i = 0; i < AI_ANALYSIS_JOBS.length; i += 1) {
    if (String(summaryJobs?.[AI_ANALYSIS_JOBS[i].id]?.status || '') !== 'confirmed') {
      return i;
    }
  }
  return -1;
}

/**
 * Map backend job meta → enterprise UI status.
 * Backend may use empty|ready|confirmed|failed|stale|pending|running.
 * UI never shows "empty".
 */
export function resolveUiJobStatus(jobId, summaryJobs, { busy = false, activeJob = null } = {}) {
  const raw = String(summaryJobs?.[jobId]?.status || 'empty').toLowerCase();
  const idx = jobIndex(jobId);

  if (busy && activeJob === jobId) return AI_ANALYSIS_UI_STATUS.RUNNING;
  if (raw === 'confirmed') return AI_ANALYSIS_UI_STATUS.CONFIRMED;
  if (raw === 'failed' || raw === 'error') return AI_ANALYSIS_UI_STATUS.FAILED;
  if (raw === 'pending' || raw === 'running') return AI_ANALYSIS_UI_STATUS.RUNNING;
  if (raw === 'ready' || raw === 'stale') return AI_ANALYSIS_UI_STATUS.NEEDS_REVIEW;

  // empty / unknown
  const head = firstIncompleteJobIndex(summaryJobs);
  if (head < 0) return AI_ANALYSIS_UI_STATUS.CONFIRMED;
  if (idx === head) return AI_ANALYSIS_UI_STATUS.READY;
  if (idx === head + 1) return AI_ANALYSIS_UI_STATUS.LOCKED;
  if (idx > head + 1) return AI_ANALYSIS_UI_STATUS.PENDING;
  return AI_ANALYSIS_UI_STATUS.LOCKED;
}

export function lockedReasonKey(jobId, summaryJobs) {
  const prevId = previousJobId(jobId);
  if (!prevId) return null;
  if (String(summaryJobs?.[prevId]?.status || '') === 'confirmed') return null;
  return 'requirements.aiAnalysisLockedDependsOn';
}

/** Never allow run-all / multi-job. */
export function assertSingleJob(job) {
  const id = String(job || '').trim();
  if (!id || id === 'all' || id.includes(',')) {
    throw new Error('Only one AI Analysis job per run');
  }
  return id;
}

export function areAllAnalysisJobsConfirmed(summaryJobs) {
  return AI_ANALYSIS_JOBS.every((j) => String(summaryJobs?.[j.id]?.status || '') === 'confirmed');
}

export function countConfirmedJobs(summaryJobs) {
  return AI_ANALYSIS_JOBS.filter(
    (j) => String(summaryJobs?.[j.id]?.status || '') === 'confirmed'
  ).length;
}

/** Map gap.type → AI Assessment label key suffix. */
export function gapTypeToAssessmentKey(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'ambiguous') return 'ambiguous';
  if (t === 'contradiction' || t === 'conflict') return 'conflict';
  if (t.startsWith('missing') || t === 'missing_requirement') return 'missing';
  if (t === 'incomplete' || t === 'gap') return 'gap';
  return 'gap';
}
