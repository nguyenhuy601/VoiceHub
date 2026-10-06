/**
 * Track B lỗ #6 — early feasibility = signal in AgentState only.
 * Does NOT replace G13 (Gate2 / Layer A). Confidence never flips passHint.
 */

const { checkFeasibility } = require('./feasibility');
const {
  deriveFeasibilityFlags,
  collectCapacityConflicts,
} = require('./deriveFeasibilityFlags');

/**
 * Enrich FEAS_SCHEDULE with past_deadline detail for Gate2 / PM HITL.
 * HOW still completes (ready); failure is a review signal, not a crash.
 */
function enrichFeasibilityFailures(failures, container = {}) {
  const list = Array.isArray(failures) ? failures : [];
  const conflicts = collectCapacityConflicts(
    container.resource || {},
    container.planning || {}
  );
  const past = conflicts.find((c) => String(c?.type || '') === 'past_deadline');
  const deadlineConflict =
    container.planning?.planSummary?.deadlineConflict &&
    typeof container.planning.planSummary.deadlineConflict === 'object'
      ? container.planning.planSummary.deadlineConflict
      : null;

  return list.map((f) => {
    if (!f || f.code !== 'FEAS_SCHEDULE') return f;
    const deadline = past?.deadline || deadlineConflict?.deadline || null;
    const estimatedEnd =
      past?.estimatedEnd || deadlineConflict?.estimatedEnd || null;
    if (deadline || estimatedEnd) {
      const daysOver =
        deadlineConflict?.daysOver != null
          ? deadlineConflict.daysOver
          : null;
      const overPart =
        daysOver != null ? ` (over by ${daysOver} day(s))` : '';
      return {
        ...f,
        message: `Schedule exceeds project deadline${overPart}: estimatedEnd=${estimatedEnd || '—'} vs deadline=${deadline || '—'} — PM must resolve at Gate2`,
        detail: {
          type: 'past_deadline',
          deadline: deadline || null,
          estimatedEnd: estimatedEnd || null,
          daysOver,
          needsPmReview: true,
        },
        needsPmReview: true,
      };
    }
    return {
      ...f,
      message: f.message || 'Schedule/deps/deadline conflict — PM must resolve at Gate2',
      needsPmReview: true,
    };
  });
}

/**
 * @param {{
 *   toolResults?: object[],
 *   container?: object,
 *   runId?: string|null,
 *   snapshotId?: string|null,
 * }} input
 * @returns {{
 *   kind: 'feasibility_signal',
 *   notG13: true,
 *   passHint: boolean,
 *   failures: object[],
 *   flags: object,
 *   evidenceRefs: string[],
 * }}
 */
function buildFeasibilitySignal(input = {}) {
  const container =
    input.container && typeof input.container === 'object' ? input.container : {};
  const flags = deriveFeasibilityFlags({
    toolResults: input.toolResults,
    container,
  });
  const check = checkFeasibility({
    runId: input.runId,
    snapshotId: input.snapshotId,
    ...flags,
  });
  const failures = enrichFeasibilityFailures(check.failures, container);

  return {
    kind: 'feasibility_signal',
    notG13: true,
    passHint: check.pass === true,
    failures,
    flags,
    evidenceRefs: Array.isArray(check.evidenceRefs) ? check.evidenceRefs : [],
    confidenceIgnored: Boolean(check.confidenceIgnored),
  };
}

/**
 * Promote signal → G13 candidate payload for Layer A / Gate2 (after agent exit).
 * Gate2 remains SoT for pass/fail + override.
 *
 * @param {ReturnType<typeof buildFeasibilitySignal>|null} signal
 * @param {{ runId?: string|null, snapshotId?: string|null }} [meta]
 */
function signalToG13Candidate(signal, meta = {}) {
  if (!signal || signal.kind !== 'feasibility_signal') {
    return checkFeasibility({
      runId: meta.runId,
      snapshotId: meta.snapshotId,
      ...(meta.flags || {}),
    });
  }
  return {
    pass: signal.passHint === true,
    failures: signal.failures,
    evidenceRefs: signal.evidenceRefs,
    evidence: [],
    confidenceIgnored: Boolean(signal.confidenceIgnored),
    source: 'agent_exit_candidate',
    fromSignal: true,
  };
}

module.exports = {
  buildFeasibilitySignal,
  signalToG13Candidate,
};
