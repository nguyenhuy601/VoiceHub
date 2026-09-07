const ALLOWED_PHASES = new Set(['staffing', 'enrich', 'full', 'assign']);

/**
 * @param {unknown} raw
 * @returns {'staffing'|'enrich'|'full'|'assign'}
 */
function normalizeAiPlanningPhase(raw) {
  const phase = String(raw || '')
    .trim()
    .toLowerCase();
  if (ALLOWED_PHASES.has(phase)) return phase;
  return 'full';
}

/**
 * enrich is an alias of assign (compat).
 * @param {'staffing'|'enrich'|'full'|'assign'} phase
 * @returns {'staffing'|'assign'|'full'}
 */
function resolveAiPlanningPhase(phase) {
  if (phase === 'enrich' || phase === 'assign') return 'assign';
  if (phase === 'staffing') return 'staffing';
  return 'full';
}

module.exports = {
  ALLOWED_PHASES,
  normalizeAiPlanningPhase,
  resolveAiPlanningPhase,
};
