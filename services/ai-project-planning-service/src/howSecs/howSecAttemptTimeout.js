/**
 * Per-attempt timeout for Risk/Quality (and other HOW secs) LLM calls.
 * Section wall budget stays on AGENT_WALL_MS; this is request-scoped.
 */

function resolveHowSecAttemptTimeoutMs(env = process.env) {
  const n = Number(env.HOW_SEC_ATTEMPT_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5_000) return Math.min(600_000, Math.round(n));
  return 120_000;
}

module.exports = { resolveHowSecAttemptTimeoutMs };
