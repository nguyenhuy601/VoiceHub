/**
 * Agentic retrieve progress & stop policy (Wave 2).
 * Progress = new sourceId/spanId + closed gaps — NOT retrieve call count.
 */

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_NO_PROGRESS_STOP = 1;

function spanKey(hit) {
  const meta = hit?.metadata || {};
  return String(meta.spanId || hit?.spanId || hit?.sourceId || hit?.citationId || '').trim();
}

/**
 * @param {{
 *   seenSourceIds?: Set<string>|string[],
 *   seenSpanIds?: Set<string>|string[],
 *   openGaps?: string[],
 *   newCitations?: object[],
 *   closedGaps?: string[],
 *   rounds?: number,
 *   maxRounds?: number,
 *   noProgressRounds?: number,
 *   budgetExhausted?: boolean,
 *   evidenceStatus?: string,
 * }} state
 */
function evaluateAgenticProgress(state = {}) {
  const seenSources = new Set(
    state.seenSourceIds instanceof Set
      ? state.seenSourceIds
      : Array.isArray(state.seenSourceIds)
        ? state.seenSourceIds
        : []
  );
  const seenSpans = new Set(
    state.seenSpanIds instanceof Set
      ? state.seenSpanIds
      : Array.isArray(state.seenSpanIds)
        ? state.seenSpanIds
        : []
  );

  const newCitations = Array.isArray(state.newCitations) ? state.newCitations : [];
  const newSourceIds = [];
  const newSpanIds = [];
  for (const c of newCitations) {
    const sid = String(c.sourceId || '').trim();
    const sp = spanKey(c);
    if (sid && !seenSources.has(sid)) newSourceIds.push(sid);
    if (sp && !seenSpans.has(sp)) newSpanIds.push(sp);
  }

  const openGaps = Array.isArray(state.openGaps) ? state.openGaps.map(String) : [];
  const closedGaps = Array.isArray(state.closedGaps) ? state.closedGaps.map(String) : [];
  const stillOpen = openGaps.filter((g) => !closedGaps.includes(g));

  const hasNewUseful =
    newSourceIds.length > 0 || newSpanIds.length > 0 || closedGaps.length > 0;
  const rounds = Number(state.rounds) || 0;
  const maxRounds = Number(state.maxRounds) > 0 ? Number(state.maxRounds) : DEFAULT_MAX_ROUNDS;
  let noProgressRounds = Number(state.noProgressRounds) || 0;
  if (!hasNewUseful) noProgressRounds += 1;
  else noProgressRounds = 0;

  let stop = false;
  let stopReason = null;
  let action = 'continue';

  if (state.evidenceStatus === 'sufficient') {
    stop = true;
    stopReason = 'evidence_sufficient';
    action = 'generate';
  } else if (state.evidenceStatus === 'conflicting') {
    stop = true;
    stopReason = 'evidence_conflicting';
    action = 'clarify';
  } else if (state.budgetExhausted) {
    stop = true;
    stopReason = 'budget_exhausted';
    action = 'stop_incomplete';
  } else if (rounds >= maxRounds) {
    stop = true;
    stopReason = 'max_rounds';
    action = 'stop_incomplete';
  } else if (noProgressRounds >= DEFAULT_NO_PROGRESS_STOP && rounds > 0) {
    stop = true;
    stopReason = 'no_new_span_or_gap_closed';
    action = 'stop_incomplete';
  }

  return {
    stop,
    stopReason,
    action,
    hasNewUseful,
    newSourceIds,
    newSpanIds,
    stillOpenGaps: stillOpen,
    noProgressRounds,
    rounds,
    maxRounds,
    nextSeenSourceIds: [...seenSources, ...newSourceIds],
    nextSeenSpanIds: [...seenSpans, ...newSpanIds],
  };
}

module.exports = {
  evaluateAgenticProgress,
  spanKey,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_NO_PROGRESS_STOP,
};
