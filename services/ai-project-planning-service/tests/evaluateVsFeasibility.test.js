const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkFeasibility } = require('../src/validation/feasibility');
const { decideEvaluateAction } = require('../src/orchestration/evaluatePolicy');

/**
 * G8 Evaluate ≠ G13 Feasibility (§3.4):
 * - Evaluate (evaluateLocal): enough information to continue the agent loop?
 * - Feasibility: is the whole plan feasible for Gate 2?
 * SoT orchestrator = agentLoopRunner (planningGraph removed).
 */
describe('evaluate vs feasibility', () => {
  it('evaluateLocal is informational sufficiency, not plan feasibility', () => {
    const evaluate = {
      kind: 'evaluate_local',
      enoughInfoToContinue: true,
      reason: 'tasks_present',
    };
    const decision = decideEvaluateAction({
      evaluate,
      contextPackage: { citations: [{ citationId: 'CIT-1' }] },
      toolResults: [{ toolName: 'EffortTool' }],
    });
    assert.ok(decision.action === 'CONTINUE' || decision.action === 'RETRIEVE');
    assert.equal(evaluate.enoughInfoToContinue, true);

    const feasibility = checkFeasibility({
      flags: { coverage: false },
    });
    assert.equal(feasibility.pass, false);
    assert.ok(feasibility.failures.some((f) => f.code === 'FEAS_COVERAGE'));
  });

  it('feasibility alone does not answer evaluate question', () => {
    const feas = checkFeasibility({ flags: { coverage: true } });
    assert.equal(feas.pass, true);
    assert.equal(feas.enoughInfoToContinue, undefined);
  });
});
