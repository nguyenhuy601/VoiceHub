/**
 * WHAT latency instrumentation — measure-only helper (no behavior change).
 * Log line: [what_timing] { round, stages, totalMs, sumStages, ... }
 */

function emptyStages() {
  return {
    hydrate: null,
    prepareWhat: null,
    /** @deprecated alias — legacy timing payloads */
    understand: null,
    // Stage timing keys kept for progress mappers (FR pipeline meta.stageTimings)
    fr_semantic: null,
    fr_conflict: null,
    fr_synthesis: null,
    fr_total: null,
    bg_derive: null,
    /** Nested wall inside bg_derive (FR LLM decompose); excluded from sumStages. */
    fr_decompose: null,
    /** Nested wall inside bg_derive (section LLM derives); excluded from sumStages. */
    raw_section_derive: null,
    engines: null,
    meta: null,
  };
}

/** Stages that are exclusive wall slices (avoid double-count nested FR sub-stages). */
const SUM_STAGE_KEYS = Object.freeze([
  'hydrate',
  'prepareWhat',
  'fr_total',
  'bg_derive',
  'engines',
  'meta',
]);

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
  for (const key of SUM_STAGE_KEYS) {
    const ms = Number(stages?.[key]?.ms);
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
  SUM_STAGE_KEYS,
  createWhatTiming,
  markStage,
  mergeStageDetail,
  sumStageMs,
  finalizeWhatTiming,
  logWhatTiming,
  startSpan,
};
