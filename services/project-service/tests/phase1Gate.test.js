const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isModuleAllowedForPhase,
  PLANNING_SUBMODULES,
} = require('../src/constants/projectDeliveryPhase');
const { evaluateRaReadiness, evaluateReadyForPhase2 } = require('../src/constants/phase2Gate');

describe('phase1 gate / nav', () => {
  it('allows planning-wbs in requirement_analysis (FE locks until Start Planning)', () => {
    assert.equal(isModuleAllowedForPhase('planning-wbs', 'requirement_analysis'), true);
    assert.equal(isModuleAllowedForPhase('planning/wbs', 'delivery_planning'), true);
    assert.ok(PLANNING_SUBMODULES.includes('planning-approval'));
  });

  it('Start Planning readiness independent of baselines', () => {
    const arts = ['BG', 'BR', 'FR', 'UC', 'NFR', 'SCOPE'].map((kind) => ({
      kind,
      status: 'approved',
      isActive: true,
    }));
    const ra = evaluateRaReadiness({ artifacts: arts, criticalGapCount: 0 });
    assert.equal(ra.raApproved, true);
    const p2 = evaluateReadyForPhase2({
      artifacts: arts,
      criticalGapCount: 0,
      srsBaselineExists: false,
      planningBaselineExists: false,
      deliveryPhase: 'requirement_analysis',
    });
    assert.equal(p2.readyForPhase2, false);
  });
});
