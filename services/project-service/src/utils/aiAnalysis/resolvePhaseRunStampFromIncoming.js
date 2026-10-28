/**
 * LangGraph SoT: phaseRuns[job] from APS emit is authoritative.
 * HTTP callback status=completed means delivery ack — not phase artifact ready.
 */

const KNOWN_PHASE_STATUSES = new Set(['ready', 'stopped', 'failed', 'incomplete']);

/**
 * @param {object|null|undefined} incomingPhase — incoming.phaseRuns[job]
 * @param {{
 *   job: string,
 *   runId: string,
 *   snapshotId: string,
 *   durationMsFallback?: number|null,
 *   feasibility?: object|null,
 * }} opts
 * @returns {object} phaseRuns stamp to persist
 */
function resolvePhaseRunStampFromIncoming(incomingPhase, opts = {}) {
  const phase = incomingPhase && typeof incomingPhase === 'object' ? { ...incomingPhase } : {};
  const job = String(opts.job || '');
  const raw = String(phase.status || '')
    .trim()
    .toLowerCase();
  let status = 'ready';
  if (KNOWN_PHASE_STATUSES.has(raw)) {
    status = raw === 'incomplete' ? 'stopped' : raw;
  }

  const stamp = {
    ...phase,
    status,
    remoteRunId: String(opts.runId || phase.remoteRunId || ''),
    snapshotId: String(opts.snapshotId || phase.snapshotId || ''),
    hitl: phase.hitl || (job === 'phase_how' ? 'gate2' : job === 'phase_what' ? 'gate1' : phase.hitl),
    durationMs:
      phase.durationMs != null
        ? phase.durationMs
        : opts.durationMsFallback != null
          ? opts.durationMsFallback
          : null,
    completedAt: phase.completedAt || new Date().toISOString(),
    error: status === 'ready' ? null : phase.error || null,
  };

  if (job === 'phase_what' && stamp.mode == null) {
    stamp.mode = 'requirement';
  }

  const feas = opts.feasibility;
  if (feas && typeof feas === 'object') {
    stamp.feasibility = feas;
  }

  return stamp;
}

module.exports = {
  resolvePhaseRunStampFromIncoming,
  KNOWN_PHASE_STATUSES,
};
