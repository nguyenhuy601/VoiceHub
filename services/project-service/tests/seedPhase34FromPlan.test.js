const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('seedPhase34FromPlan helpers', () => {
  it('exports seed helpers', () => {
    const mod = require('../src/services/seedPhase34FromPlan.service');
    assert.equal(typeof mod.seedPhase34FromPlan, 'function');
    assert.equal(typeof mod.ensureHandoverChecklistSkeleton, 'function');
    assert.equal(typeof mod.seedTestCaseStubsFromTasks, 'function');
    assert.ok(mod.MAX_SEED_TESTCASES >= 1);
  });

  it('checklist skeleton ids match RELEASE_HANDOVER_CHECKLIST', () => {
    const {
      RELEASE_HANDOVER_CHECKLIST,
    } = require('../src/constants/projectDeliveryPhase');
    const ids = RELEASE_HANDOVER_CHECKLIST.map((x) => x.id);
    assert.deepEqual(ids, [
      'release_notes',
      'deployment_verified',
      'acceptance_signed_off',
      'handover_completed',
    ]);
  });
});

describe('assertGate2 still required for promote', () => {
  it('denies when projectPlan not confirmed', () => {
    const {
      assertGate2ProjectPlanConfirmed,
    } = require('../src/utils/tools/assertGate2ProjectPlanConfirmed');
    assert.throws(
      () =>
        assertGate2ProjectPlanConfirmed({
          aiAnalysis: { jobs: { projectPlan: { status: 'ready' } } },
        }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED'
    );
  });
});
