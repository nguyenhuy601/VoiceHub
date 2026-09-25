/**
 * Track B lỗ #6 — early feasibility = signal in AgentState only.
 * Does NOT replace G13 (Gate2 / Layer A). Confidence never flips passHint.
 */

const { checkFeasibility } = require('./feasibility');
const { deriveFeasibilityFlags } = require('./deriveFeasibilityFlags');

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
  const flags = deriveFeasibilityFlags({
    toolResults: input.toolResults,
    container: input.container,
  });
  const check = checkFeasibility({
    runId: input.runId,
    snapshotId: input.snapshotId,
    ...flags,
  });

  return {
    kind: 'feasibility_signal',
    notG13: true,
    passHint: check.pass === true,
    failures: Array.isArray(check.failures) ? check.failures : [],
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
