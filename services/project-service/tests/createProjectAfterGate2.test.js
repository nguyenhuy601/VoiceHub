const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertGate2ProjectPlanConfirmed,
} = require('../src/utils/tools/assertGate2ProjectPlanConfirmed');
const {
  assertBlueprintReadyForProjectCreate,
} = require('../src/utils/aiAnalysis/aiAnalysisBlueprintImport');

describe('assertGate2ProjectPlanConfirmed', () => {
  it('denies when phase_how is not confirmed', () => {
    assert.throws(
      () =>
        assertGate2ProjectPlanConfirmed({
          aiAnalysis: {
            phaseRuns: { phase_how: { status: 'ready' } },
          },
        }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED' && err.statusCode === 409
    );
  });

  it('denies when phase_how missing', () => {
    assert.throws(
      () => assertGate2ProjectPlanConfirmed({ aiAnalysis: { phaseRuns: {} } }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED'
    );
  });

  it('allows when phase_how is confirmed', () => {
    const result = assertGate2ProjectPlanConfirmed({
      aiAnalysis: {
        phaseRuns: { phase_how: { status: 'confirmed' } },
        planning: { tasks: [{ id: 'T1' }] },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.projectPlan, 'confirmed');
  });

  it('migrates legacy jobs.projectPlan confirmed', () => {
    const result = assertGate2ProjectPlanConfirmed({
      aiAnalysis: {
        jobs: { projectPlan: { status: 'confirmed' } },
      },
    });
    assert.equal(result.ok, true);
  });
});

describe('assertBlueprintReadyForProjectCreate still requires tasks', () => {
  it('denies when phase_how not confirmed (Gate 2)', () => {
    assert.throws(
      () =>
        assertBlueprintReadyForProjectCreate({
          aiAnalysis: {
            phaseRuns: { phase_how: { status: 'ready' } },
            planning: { tasks: [{ id: 'T1' }] },
          },
        }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED' && err.statusCode === 409
    );
  });

  it('allows confirmed plan with tasks', () => {
    const container = assertBlueprintReadyForProjectCreate({
      aiAnalysis: {
        phaseRuns: { phase_how: { status: 'confirmed' } },
        planning: { tasks: [{ id: 'T1', title: 'A' }] },
      },
    });
    assert.ok(container.planning.tasks.length);
  });
});
