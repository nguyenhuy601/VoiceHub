const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkFeasibility } = require('../src/validation/feasibility');
const { runPlanningGraph } = require('../src/orchestration/planningGraph');

/**
 * G8 Evaluate ≠ G13 Feasibility (§3.4):
 * - Evaluate (evaluateLocal): enough information to continue the agent loop?
 * - Feasibility: is the whole plan feasible for Gate 2?
 */
describe('evaluate vs feasibility', () => {
  it('evaluateLocal is informational sufficiency, not plan feasibility', async () => {
    const state = await runPlanningGraph({
      runId: 'r-eval',
      snapshotId: 'SNAP-X',
      corpus: [{ id: '1', text: 'FR login' }],
      feasibilityFlags: { coverage: false },
    });

    assert.equal(state.evaluate.kind, 'evaluate_local');
    assert.equal(state.evaluate.enoughInfoToContinue, true);
    // Plan can still fail G13 even when G8 says continue
    assert.equal(state.feasibility.pass, false);
    assert.ok(state.feasibility.failures.some((f) => f.code === 'FEAS_COVERAGE'));
  });

  it('feasibility alone does not answer evaluate question', () => {
    const feas = checkFeasibility({ flags: { coverage: true } });
    assert.equal(feas.pass, true);
    // No "enoughInfoToContinue" on G13 output — different contract
    assert.equal(feas.enoughInfoToContinue, undefined);
  });
});
