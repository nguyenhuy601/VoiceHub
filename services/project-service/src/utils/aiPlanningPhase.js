const ALLOWED_PHASES = new Set(['staffing', 'enrich', 'full']);

/**
 * @param {unknown} raw
 * @returns {'staffing'|'enrich'|'full'}
 */
function normalizeAiPlanningPhase(raw) {
  const phase = String(raw || '')
    .trim()
    .toLowerCase();
  if (ALLOWED_PHASES.has(phase)) return phase;
  return 'full';
}

module.exports = {
  ALLOWED_PHASES,
  normalizeAiPlanningPhase,
};
