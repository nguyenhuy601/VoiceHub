const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateReadyForPhase2,
  evaluateRaReadiness,
  PHASE1_REQUIRED_KINDS,
} = require('../src/constants/phase2Gate');

function approvedCatalog(kinds = PHASE1_REQUIRED_KINDS) {
  return kinds.map((kind) => ({
    kind,
    status: 'approved',
    isActive: true,
  }));
}

describe('evaluateReadyForPhase2 (v2)', () => {
  it('ready when required kinds + baselines + no critical gaps', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'delivery_planning',
      artifacts: approvedCatalog(),
      criticalGapCount: 0,
      srsBaselineExists: true,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, true);
    assert.equal(r.blockingReasons.length, 0);
  });

  it('BPM optional by default (not in PHASE1_REQUIRED_KINDS)', () => {
    const arts = approvedCatalog().filter((a) => a.kind !== 'BPM');
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: arts,
      criticalGapCount: 0,
      srsBaselineExists: true,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, true);
  });

  it('blocks when SRS baseline missing', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'delivery_planning',
      artifacts: approvedCatalog(),
      criticalGapCount: 0,
      srsBaselineExists: false,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'NO_SRS_BASELINE'));
  });

  it('blocks when Planning baseline missing', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'delivery_planning',
      artifacts: approvedCatalog(),
      criticalGapCount: 0,
      srsBaselineExists: true,
      planningBaselineExists: false,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'NO_PLANNING_BASELINE'));
  });

  it('blocks when a required kind is missing', () => {
    const arts = approvedCatalog().filter((a) => a.kind !== 'FR');
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: arts,
      criticalGapCount: 0,
      srsBaselineExists: true,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'MISSING_KIND_FR'));
  });

  it('respects template requiredKinds including BPM', () => {
    const arts = approvedCatalog(['BG', 'BR', 'FR', 'UC', 'NFR', 'SCOPE']);
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'delivery_planning',
      artifacts: arts,
      criticalGapCount: 0,
      requiredKinds: ['BG', 'BR', 'BPM', 'FR', 'UC', 'NFR', 'SCOPE'],
      srsBaselineExists: true,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'MISSING_KIND_BPM'));
  });

  it('blocks on critical gaps', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: approvedCatalog(),
      criticalGapCount: 1,
      srsBaselineExists: true,
      planningBaselineExists: true,
    });
    assert.equal(r.readyForPhase2, false);
  });
});

describe('evaluateRaReadiness', () => {
  it('raApproved without baselines', () => {
    const r = evaluateRaReadiness({
      artifacts: approvedCatalog(),
      criticalGapCount: 0,
    });
    assert.equal(r.raApproved, true);
  });

  it('blocks pending draft', () => {
    const arts = [...approvedCatalog(), { kind: 'FR', status: 'draft', isActive: true }];
    const r = evaluateRaReadiness({ artifacts: arts, criticalGapCount: 0 });
    assert.equal(r.raApproved, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'PENDING_FR'));
  });
});
