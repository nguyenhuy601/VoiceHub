const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertGate2ProjectPlanConfirmed,
} = require('../src/utils/tools/assertGate2ProjectPlanConfirmed');

describe('projectPromoteFromGate2 Gate2 policy', () => {
  it('requires projectPlan confirmed before promote', () => {
    assert.throws(
      () =>
        assertGate2ProjectPlanConfirmed({
          aiAnalysis: { jobs: { projectPlan: { status: 'ready' } } },
        }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED' && err.statusCode === 409
    );
  });

  it('allows when Gate2 confirmed', () => {
    const result = assertGate2ProjectPlanConfirmed({
      aiAnalysis: { jobs: { projectPlan: { status: 'confirmed' } } },
    });
    assert.equal(result.ok, true);
  });
});
