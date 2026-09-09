/**
 * W10 — stale pending AI Analysis jobs → failed after wall.
 */

const { ensureAiAnalysisContainer } = require('./aiAnalysisContainer');
const { AI_ANALYSIS_USER_JOBS } = require('../../constants/aiAnalysisJobs.constants');

const STALE_PENDING_MS = 15 * 60 * 1000;

function failStalePendingAiAnalysisJobs(container, { now = Date.now(), staleMs = STALE_PENDING_MS } = {}) {
  const next = ensureAiAnalysisContainer(container);
  let changed = false;
  for (const job of AI_ANALYSIS_USER_JOBS) {
    const meta = next.jobs[job];
    if (!meta || meta.status !== 'pending') continue;
    const generatedAt = meta.generatedAt ? Date.parse(meta.generatedAt) : NaN;
    if (!Number.isFinite(generatedAt)) continue;
    if (now - generatedAt < staleMs) continue;
    next.jobs[job] = {
      ...meta,
      status: 'failed',
      error: 'stale_pending_timeout',
    };
    changed = true;
  }
  return { container: next, changed };
}

/** Reuse: if job already ready/confirmed and not forcing, skip re-run (caller checks). */
function shouldSkipRerunBecauseReady(container, job, { force = false } = {}) {
  if (force) return false;
  const status = String(container?.jobs?.[job]?.status || '');
  return status === 'ready' || status === 'confirmed';
}

module.exports = {
  STALE_PENDING_MS,
  failStalePendingAiAnalysisJobs,
  shouldSkipRerunBecauseReady,
};
