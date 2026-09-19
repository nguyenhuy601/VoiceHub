/**
 * Client poll budgets — mirror services/project-service
 * src/utils/aiAnalysis/aiAnalysisJobBudgets.js DEFAULT_JOB_WALL_MS.
 * Keep in sync when BE defaults change.
 */
export const AI_ANALYSIS_JOB_WALL_MS = Object.freeze({
  hierarchyDecomposition: 120_000,
  requirementAnalysis: 300_000,
  capabilityAnalysis: 240_000,
  requirementInsights: 180_000,
  wbsGeneration: 240_000,
  dependencyAnalysis: 180_000,
  architectureRiskAnalysis: 240_000,
  effortRoleAnalysis: 120_000,
  sequencingCpm: 60_000,
  employeeMatching: 180_000,
  scheduleCapacity: 180_000,
  projectPlan: 60_000,
});

/** Extra wait beyond BE wall for poll interval + network lag. */
export const AI_ANALYSIS_POLL_SLACK_MS = 60_000;

const DEFAULT_WALL_MS = 180_000;
const POLL_TERMINAL_STATUSES = new Set(['ready', 'failed', 'confirmed']);

/**
 * @param {string} job
 * @returns {number}
 */
export function resolveAiAnalysisPollTimeoutMs(job) {
  const wall = AI_ANALYSIS_JOB_WALL_MS[String(job || '').trim()] ?? DEFAULT_WALL_MS;
  return wall + AI_ANALYSIS_POLL_SLACK_MS;
}

export async function pollAiAnalysisJob({
  job,
  fetchSummary,
  onSummary = () => {},
  isCancelled = () => false,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  timeoutMs = resolveAiAnalysisPollTimeoutMs(job),
  initialDelayMs = 750,
  maxDelayMs = 5_000,
}) {
  const startedAt = Date.now();
  let delayMs = initialDelayMs;
  while (!isCancelled()) {
    const summary = await fetchSummary();
    if (isCancelled()) return null;
    onSummary(summary);
    const status = summary?.jobs?.[job]?.status;
    if (POLL_TERMINAL_STATUSES.has(status)) return summary;
    if (Date.now() - startedAt >= timeoutMs) {
      const error = new Error(`Timed out waiting for AI analysis job ${job}`);
      error.code = 'AI_ANALYSIS_POLL_TIMEOUT';
      throw error;
    }
    await wait(delayMs);
    delayMs = Math.min(maxDelayMs, Math.ceil(delayMs * 1.5));
  }
  return null;
}
