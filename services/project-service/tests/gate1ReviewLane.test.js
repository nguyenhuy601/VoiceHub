/**
 * Unit — Gate 1 reviewLane resolve + actor guards
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  REVIEW_LANE,
  resolveGate1ReviewLane,
  assertActorMayActOnLane,
  stampGate1ReviewLane,
} = require('../src/utils/srsProposal/gate1ReviewLane');

describe('gate1ReviewLane', () => {
  it('reads explicit reviewLane', () => {
    assert.equal(
      resolveGate1ReviewLane({ aiAnalysis: { gate1: { reviewLane: 'po' } } }),
      REVIEW_LANE.PO
    );
  });

  it('legacy under_review → po; approved → done', () => {
    assert.equal(resolveGate1ReviewLane({ status: 'under_review' }), REVIEW_LANE.PO);
    assert.equal(resolveGate1ReviewLane({ status: 'approved' }), REVIEW_LANE.DONE);
  });

  it('WHAT ready / proposal → ba when no lane', () => {
    assert.equal(
      resolveGate1ReviewLane({
        status: 'draft',
        aiAnalysis: {
          phaseRuns: { phase_what: { status: 'ready' } },
          analyses: { srsProposal: { generated: {} } },
        },
      }),
      REVIEW_LANE.BA
    );
  });

  it('submit only on ba or po; approve/reject only on po', () => {
    assert.equal(assertActorMayActOnLane('submit', 'ba').ok, true);
    assert.equal(assertActorMayActOnLane('submit', 'po').ok, true);
    assert.throws(() => assertActorMayActOnLane('submit', 'done'), (e) => e.errorCode === 'GATE1_WRONG_LANE');
    assert.equal(assertActorMayActOnLane('approve', 'po').ok, true);
    assert.equal(assertActorMayActOnLane('reject', 'po').ok, true);
    assert.throws(() => assertActorMayActOnLane('approve', 'ba'), (e) => e.errorCode === 'GATE1_WRONG_LANE');
    assert.throws(() => assertActorMayActOnLane('reject', 'ba'), (e) => e.errorCode === 'GATE1_WRONG_LANE');
  });

  it('stampGate1ReviewLane writes gate1.reviewLane', () => {
    const next = stampGate1ReviewLane({ analyses: {} }, REVIEW_LANE.BA);
    assert.equal(next.gate1.reviewLane, 'ba');
    assert.ok(next.gate1.reviewLaneUpdatedAt);
  });
});
