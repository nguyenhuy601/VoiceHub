const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluatePlanningBaselineReadiness,
  PLANNING_BASELINE_REQUIRED_KINDS,
} = require('../src/constants/planningBaselinePolicy');

describe('planningBaselinePolicy', () => {
  it('lists required kinds', () => {
    assert.ok(PLANNING_BASELINE_REQUIRED_KINDS.includes('WBS'));
    assert.ok(PLANNING_BASELINE_REQUIRED_KINDS.includes('RESOURCE'));
  });

  it('blocks when required kinds missing', () => {
    const r = evaluatePlanningBaselineReadiness([
      { kind: 'WBS', status: 'approved', isActive: true },
      { kind: 'RISK', status: 'approved', isActive: true },
    ]);
    assert.equal(r.ok, false);
    assert.ok(r.missingRequired.includes('SCHEDULE'));
    assert.ok(r.missingRequired.includes('MILESTONE'));
    assert.ok(r.missingRequired.includes('RESOURCE'));
  });

  it('ok when all required approved', () => {
    const arts = PLANNING_BASELINE_REQUIRED_KINDS.map((kind) => ({
      kind,
      status: 'approved',
      isActive: true,
    }));
    const r = evaluatePlanningBaselineReadiness(arts);
    assert.equal(r.ok, true);
    assert.deepEqual(r.missingRequired, []);
    assert.ok(r.missingRecommended.includes('ARCHITECTURE'));
  });

  it('ignores draft and inactive', () => {
    const arts = [
      ...PLANNING_BASELINE_REQUIRED_KINDS.map((kind) => ({
        kind,
        status: 'draft',
        isActive: true,
      })),
      { kind: 'WBS', status: 'approved', isActive: false },
    ];
    const r = evaluatePlanningBaselineReadiness(arts);
    assert.equal(r.ok, false);
  });
});
