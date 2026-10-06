import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE2_REVIEW_LANE,
  resolveGate2ReviewLane,
  resolveGate2ReviewView,
} from './gate2ReviewLane.js';

describe('gate2ReviewLane FE', () => {
  it('resolveGate2ReviewLane legacy ready → pm', () => {
    assert.equal(
      resolveGate2ReviewLane({
        status: 'approved',
        aiAnalysis: { phaseRuns: { phase_how: { status: 'ready' } } },
      }),
      GATE2_REVIEW_LANE.PM
    );
  });

  it('PO waits at PM lane (SoD)', () => {
    assert.equal(
      resolveGate2ReviewView({
        lane: 'pm',
        howStatus: 'ready',
        canReviewPm: true,
        canReviewPo: true,
      }),
      'waitingPm'
    );
  });

  it('PM sees panel at pm lane', () => {
    assert.equal(
      resolveGate2ReviewView({
        lane: 'pm',
        howStatus: 'ready',
        canReviewPm: true,
        canReviewPo: false,
      }),
      'showPmPanel'
    );
  });

  it('PO sees panel at po lane', () => {
    assert.equal(
      resolveGate2ReviewView({
        lane: 'po',
        howStatus: 'ready',
        canReviewPm: false,
        canReviewPo: true,
      }),
      'showPoPanel'
    );
  });

  it('how pending → howPending', () => {
    assert.equal(
      resolveGate2ReviewView({
        lane: 'pm',
        howStatus: 'pending',
        canReviewPm: true,
        canReviewPo: false,
      }),
      'howPending'
    );
  });
});
