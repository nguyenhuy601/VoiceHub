import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_LANE,
  resolveGate1ReviewLane,
  resolveGate1ReviewView,
} from './gate1ReviewLane.js';

describe('gate1ReviewLane FE', () => {
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

  it('WHAT ready → ba when no lane', () => {
    assert.equal(
      resolveGate1ReviewLane({
        status: 'draft',
        aiAnalysis: {
          phaseRuns: { phase_what: { status: 'ready' } },
          analyses: { srsProposal: {} },
        },
      }),
      REVIEW_LANE.BA
    );
  });

  it('resolveGate1ReviewView by role + lane', () => {
    assert.equal(
      resolveGate1ReviewView({ lane: 'ba', canSubmit: true, canApprove: false }),
      'showBaPanel'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'ba', canSubmit: false, canApprove: true }),
      'waitingBa'
    );
    // PO with dual canSubmit must NOT see BA panel (SoD)
    assert.equal(
      resolveGate1ReviewView({ lane: 'ba', canSubmit: true, canApprove: true }),
      'waitingBa'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'po', canSubmit: false, canApprove: true }),
      'showPoPanel'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'po', canSubmit: true, canApprove: true }),
      'showPoPanel'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'po', canSubmit: true, canApprove: false }),
      'waitingPo'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'done', canSubmit: true, canApprove: true }),
      'done'
    );
    assert.equal(
      resolveGate1ReviewView({ lane: 'ba', canSubmit: false, canApprove: false }),
      'waitingBa'
    );
  });
});
