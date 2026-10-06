const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  REVIEW_LANE,
  resolveGate2ReviewLane,
  assertActorMayActOnLane,
  stampGate2ReviewLane,
} = require('../src/utils/aiAnalysis/gate2ReviewLane');

describe('gate2ReviewLane', () => {
  it('reads explicit reviewLane', () => {
    assert.equal(
      resolveGate2ReviewLane({ aiAnalysis: { gate2: { reviewLane: 'po' } } }),
      REVIEW_LANE.PO
    );
  });

  it('legacy phase_how confirmed → done', () => {
    assert.equal(
      resolveGate2ReviewLane({
        status: 'approved',
        aiAnalysis: { phaseRuns: { phase_how: { status: 'confirmed' } } },
      }),
      REVIEW_LANE.DONE
    );
  });

  it('approved + how ready → pm', () => {
    assert.equal(
      resolveGate2ReviewLane({
        status: 'approved',
        aiAnalysis: { phaseRuns: { phase_how: { status: 'ready' } } },
      }),
      REVIEW_LANE.PM
    );
  });

  it('assertActorMayActOnLane enforces pm then po', () => {
    assert.equal(assertActorMayActOnLane('pm_submit', 'pm').ok, true);
    assert.throws(() => assertActorMayActOnLane('po_approve', 'pm'), /Chờ PM/);
    assert.equal(assertActorMayActOnLane('po_approve', 'po').ok, true);
    assert.throws(() => assertActorMayActOnLane('pm_submit', 'done'), /Không thể gửi/);
  });

  it('stampGate2ReviewLane writes gate2', () => {
    const next = stampGate2ReviewLane({}, 'po', { submittedBy: 'u1' });
    assert.equal(next.gate2.reviewLane, 'po');
    assert.equal(next.gate2.submittedBy, 'u1');
    assert.ok(next.gate2.reviewLaneUpdatedAt);
  });

  it('ensureAiAnalysisContainer keeps gate2 so PO approve lane stays po', () => {
    const { ensureAiAnalysisContainer } = require('../src/utils/aiAnalysis/aiAnalysisContainer');
    const ensured = ensureAiAnalysisContainer({
      schemaVersion: 2,
      phaseRuns: { phase_how: { status: 'ready' } },
      gate2: { reviewLane: 'po', submittedBy: 'pm-1' },
    });
    assert.equal(
      resolveGate2ReviewLane({ status: 'approved', aiAnalysis: ensured }),
      REVIEW_LANE.PO
    );
  });
});
