/**
 * Presentation thresholds for Monitor soft hints / stale (not pipeline state).
 */
export const WHAT_MONITOR_CONFIG = Object.freeze({
  softHintMs: 12_000,
  softHintLongMs: 20_000,
  /** No progressUpdatedAt bump while still running → show stale line. */
  progressStaleMs: 90_000,
  /**
   * HOW wall: if liveRun still "running" past this age (no terminal status),
   * treat as failed so the clock stops (matches ~AGENT_WALL_MS + buffer).
   */
  howRunMaxLiveMs: 1_500_000,
});

/**
 * True when HOW startedAt is older than howRunMaxLiveMs (zombie / lost progress).
 * Used by Monitor + canRerunHow so FE-forced fail still shows «Chạy lại HOW».
 */
export function isHowRunWallTimedOut(liveRun, phaseHow, now = Date.now()) {
  const maxLive = Number(WHAT_MONITOR_CONFIG.howRunMaxLiveMs) || 0;
  if (maxLive <= 0) return false;
  const startedRaw = liveRun?.startedAt || phaseHow?.startedAt || null;
  if (!startedRaw) return false;
  const startedAt = new Date(startedRaw).getTime();
  if (!Number.isFinite(startedAt)) return false;
  return now - startedAt > maxLive;
}

export default WHAT_MONITOR_CONFIG;
