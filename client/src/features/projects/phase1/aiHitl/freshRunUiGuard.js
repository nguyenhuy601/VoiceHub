/**
 * Guard Monitor UI during WHAT/HOW re-run start: poll may still return the previous
 * ready pack before the new run is visible.
 */

export const PHASE_IN_FLIGHT = new Set(['pending', 'running', 'queued', 'waiting_human']);

export function isPhaseInFlightStatus(status) {
  return PHASE_IN_FLIGHT.has(String(status || '').trim().toLowerCase());
}

/**
 * @param {object|null} prev
 * @param {object|null} next
 * @param {'what'|'how'|null} awaiting
 * @returns {{ pack: object|null, release: boolean }}
 */
export function protectPackDuringFreshRunAwait(prev, next, awaiting) {
  if (!awaiting || !prev) return { pack: next, release: true };
  const phaseKey = awaiting === 'how' ? 'phase_how' : 'phase_what';
  const nextPhaseStatus = next?.aiAnalysis?.phaseRuns?.[phaseKey]?.status;
  const nextLiveStatus = next?.liveRun?.status;
  if (isPhaseInFlightStatus(nextPhaseStatus) || isPhaseInFlightStatus(nextLiveStatus)) {
    return { pack: next, release: true };
  }

  const prevAi = prev.aiAnalysis || {};
  const nextAi = next?.aiAnalysis || {};
  const mergedAi = {
    ...nextAi,
    analyses: prevAi.analyses,
    phaseRuns: {
      ...(nextAi.phaseRuns || {}),
      [phaseKey]: prevAi.phaseRuns?.[phaseKey],
    },
  };
  if (awaiting === 'what') {
    mergedAi.gate1 = prevAi.gate1;
  } else {
    mergedAi.planning = prevAi.planning;
  }

  return {
    pack: {
      ...next,
      status: awaiting === 'what' ? prev.status : next.status,
      submittedBy: awaiting === 'what' ? prev.submittedBy : next.submittedBy,
      submittedAt: awaiting === 'what' ? prev.submittedAt : next.submittedAt,
      aiAnalysis: mergedAi,
    },
    release: false,
  };
}
