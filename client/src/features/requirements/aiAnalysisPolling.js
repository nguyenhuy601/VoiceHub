const POLL_TERMINAL_STATUSES = new Set(['ready', 'failed', 'confirmed']);

export async function pollAiAnalysisJob({
  job,
  fetchSummary,
  onSummary = () => {},
  isCancelled = () => false,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  timeoutMs = 120_000,
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
