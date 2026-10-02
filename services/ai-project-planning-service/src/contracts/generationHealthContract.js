/**
 * Generation health — monotonic / degraded-preserving (S6).
 */

function asFailedTasks(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((t) => String(t || '').trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * @param {object|null|undefined} raw
 * @returns {{ partial: boolean, failedTasks: string[], coverage: object|null }}
 */
function normalizeGenerationHealth(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { partial: false, failedTasks: [], coverage: null };
  }
  const coverage =
    raw.coverage && typeof raw.coverage === 'object' && !Array.isArray(raw.coverage)
      ? { ...raw.coverage }
      : null;
  return {
    partial: Boolean(raw.partial),
    failedTasks: asFailedTasks(raw.failedTasks),
    coverage,
  };
}

/**
 * OR-preserve partial; union failedTasks; prefer non-null coverage with higher total.
 * @param {object|null|undefined} prev
 * @param {object|null|undefined} next
 */
function mergeGenerationHealth(prev, next) {
  const a = normalizeGenerationHealth(prev);
  const b = normalizeGenerationHealth(next);
  const failedTasks = asFailedTasks([...a.failedTasks, ...b.failedTasks]);
  let coverage = a.coverage || b.coverage || null;
  if (a.coverage && b.coverage) {
    const aTotal = Number(a.coverage.total);
    const bTotal = Number(b.coverage.total);
    coverage =
      Number.isFinite(bTotal) && (!Number.isFinite(aTotal) || bTotal >= aTotal)
        ? { ...b.coverage }
        : { ...a.coverage };
  }
  return {
    partial: a.partial || b.partial,
    failedTasks,
    coverage,
  };
}

/**
 * Map G4 / phaseOut meta signals into a generationHealth patch.
 * @param {{ partial?: boolean, failedTasks?: string[], coverage?: object, llmFailed?: boolean, task?: string }} meta
 */
function buildGenerationHealthFromMeta(meta = {}) {
  const failedTasks = asFailedTasks(meta.failedTasks);
  const task = String(meta.task || '').trim();
  const partial = Boolean(meta.partial || meta.llmFailed);
  if (partial && task && !failedTasks.includes(task)) {
    failedTasks.push(task);
  }
  if (partial && !failedTasks.length && meta.llmFailed) {
    failedTasks.push('semantic');
  }
  return normalizeGenerationHealth({
    partial,
    failedTasks,
    coverage: meta.coverage,
  });
}

module.exports = {
  normalizeGenerationHealth,
  mergeGenerationHealth,
  buildGenerationHealthFromMeta,
};
