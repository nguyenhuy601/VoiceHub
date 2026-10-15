/**
 * Presentation thresholds for Monitor soft hints / stale (not pipeline state).
 */
export const WHAT_MONITOR_CONFIG = Object.freeze({
  softHintMs: 12_000,
  softHintLongMs: 20_000,
  /** No progressUpdatedAt bump while still running → show stale line. */
  progressStaleMs: 90_000,
});

export default WHAT_MONITOR_CONFIG;
