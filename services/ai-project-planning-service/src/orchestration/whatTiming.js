/**
 * WHAT latency instrumentation — measure-only helper (no behavior change).
 * Log line: [what_timing] { round, stages, totalMs, sumStages, ... }
 */

function emptyStages() {
  return {
    hydrate: null,
    understand: null,
    g4_semantic: null,
    g4_conflict: null,
    g4_synthesis: null,
    g4_total: null,
    bg_derive: null,
    engines: null,
    meta: null,
  };
}

/**
 * @param {{ round?: number|string, packId?: string, snapshotId?: string, runId?: string }} [meta]
 */
function createWhatTiming(meta = {}) {
  return {
    round: meta.round != null ? meta.round : 0,
    packId: meta.packId || null,
    snapshotId: meta.snapshotId || null,
    runId: meta.runId || null,
    wallStartedAt: Date.now(),
    stages: emptyStages(),
  };
}

/**
 * @param {object} timing
 * @param {string} stage
 * @param {number|object} msOrDetail — ms number or { ms, ...extra }
 */
function markStage(timing, stage, msOrDetail) {
  if (!timing || typeof timing !== 'object') return timing;
  const stages = timing.stages && typeof timing.stages === 'object'
    ? { ...timing.stages }
    : emptyStages();
  if (msOrDetail != null && typeof msOrDetail === 'object' && !Array.isArray(msOrDetail)) {
    const ms = Number(msOrDetail.ms);
    stages[stage] = {
      ...msOrDetail,
      ms: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null,
    };
  } else {
    const ms = Number(msOrDetail);
    stages[stage] = {
      ms: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null,
    };
  }
  return { ...timing, stages };
}

function mergeStageDetail(timing, stage, detail) {
  if (!timing || typeof timing !== 'object') return timing;
  const prev = timing.stages?.[stage] && typeof timing.stages[stage] === 'object'
    ? timing.stages[stage]
    : {};
  return markStage(timing, stage, { ...prev, ...(detail || {}) });
}

function sumStageMs(stages = {}) {
  let sum = 0;
  for (const key of Object.keys(stages || {})) {
    const ms = Number(stages[key]?.ms);
    if (Number.isFinite(ms)) sum += ms;
  }
  return sum;
}

/**
 * @param {object} timing
 * @param {{ totalMs?: number }} [opts]
 */
function finalizeWhatTiming(timing, opts = {}) {
  const t = timing && typeof timing === 'object' ? timing : createWhatTiming();
  const wall = opts.totalMs != null
    ? Math.max(0, Math.round(Number(opts.totalMs)))
    : Math.max(0, Date.now() - (t.wallStartedAt || Date.now()));
  const sumStages = sumStageMs(t.stages);
  return {
    ...t,
    totalMs: wall,
    sumStages,
  };
}

function logWhatTiming(timing, opts = {}) {
  const final = finalizeWhatTiming(timing, opts);
  // eslint-disable-next-line no-console
  console.info('[what_timing] %s', JSON.stringify(final));
  return final;
}

function startSpan() {
  const t0 = Date.now();
  return () => Math.max(0, Date.now() - t0);
}

module.exports = {
  emptyStages,
  createWhatTiming,
  markStage,
  mergeStageDetail,
  sumStageMs,
  finalizeWhatTiming,
  logWhatTiming,
  startSpan,
};
