const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createEmptyAiAnalysisContainer,
  ensureAiAnalysisContainer,
  summarizeAiAnalysis,
} = require('../src/utils/aiAnalysis/aiAnalysisContainer');
const {
  migrateJobsProjectionToPhaseRuns,
  markPhaseHowConfirmed,
  isPhaseHowConfirmed,
} = require('../src/utils/aiAnalysis/phaseGate2');
const {
  assertGate2ProjectPlanConfirmed,
} = require('../src/utils/tools/assertGate2ProjectPlanConfirmed');

describe('phase-only no jobs projection', () => {
  it('empty container has no jobs map', () => {
    const c = createEmptyAiAnalysisContainer();
    assert.equal(c.jobs, undefined);
    assert.ok(c.phaseRuns);
    assert.ok(c.analyses);
  });

  it('migrates legacy jobs.projectPlan confirmed → phase_how', () => {
    const migrated = migrateJobsProjectionToPhaseRuns({
      jobs: { projectPlan: { status: 'confirmed', confirmedAt: '2026-01-01' } },
      analyses: {},
    });
    assert.equal(migrated.jobs, undefined);
    assert.equal(migrated.phaseRuns.phase_how.status, 'confirmed');
  });

  it('ensureAiAnalysisContainer strips jobs', () => {
    const c = ensureAiAnalysisContainer({
      jobs: { wbsGeneration: { status: 'ready' } },
      phaseRuns: { phase_how: { status: 'ready' } },
    });
    assert.equal(c.jobs, undefined);
    assert.equal(c.phaseRuns.phase_how.status, 'ready');
  });

  it('Gate2 assert uses phase_how confirmed', () => {
    assert.throws(
      () =>
        assertGate2ProjectPlanConfirmed({
          aiAnalysis: { phaseRuns: { phase_how: { status: 'ready' } } },
        }),
      (err) => err.errorCode === 'GATE2_PROJECT_PLAN_REQUIRED'
    );
    const ok = assertGate2ProjectPlanConfirmed({
      aiAnalysis: { phaseRuns: { phase_how: { status: 'confirmed' } } },
    });
    assert.equal(ok.ok, true);
  });

  it('summarize exposes phaseRuns not jobs', () => {
    const s = summarizeAiAnalysis({
      phaseRuns: { phase_how: { status: 'ready' } },
    });
    assert.equal(s.jobs, undefined);
    assert.equal(s.phaseRuns.phase_how.status, 'ready');
  });

  it('markPhaseHowConfirmed sets confirmed', () => {
    const c = markPhaseHowConfirmed({
      phaseRuns: { phase_how: { status: 'ready' } },
    });
    assert.ok(isPhaseHowConfirmed(c));
  });
});
