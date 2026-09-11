const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReadyForPhase2, PHASE1_REQUIRED_KINDS } = require('../src/constants/phase2Gate');

function approvedCatalog() {
  return PHASE1_REQUIRED_KINDS.map((kind) => ({
    kind,
    status: 'approved',
    isActive: true,
  }));
}

describe('evaluateReadyForPhase2', () => {
  it('ready when all kinds approved and no critical gaps', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: approvedCatalog(),
      criticalGapCount: 0,
    });
    assert.equal(r.readyForPhase2, true);
    assert.equal(r.blockingReasons.length, 0);
  });

  it('blocks when a kind is missing', () => {
    const arts = approvedCatalog().filter((a) => a.kind !== 'BPM');
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: arts,
      criticalGapCount: 0,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'MISSING_KIND_BPM'));
  });

  it('blocks when pending draft exists', () => {
    const arts = [
      ...approvedCatalog(),
      { kind: 'FR', status: 'draft', isActive: true },
    ];
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: arts,
      criticalGapCount: 0,
    });
    assert.equal(r.readyForPhase2, false);
    assert.ok(r.blockingReasons.some((b) => b.code === 'PENDING_FR'));
  });

  it('blocks on critical gaps', () => {
    const r = evaluateReadyForPhase2({
      deliveryPhase: 'requirement_analysis',
      artifacts: approvedCatalog(),
      criticalGapCount: 1,
    });
    assert.equal(r.readyForPhase2, false);
  });
});
