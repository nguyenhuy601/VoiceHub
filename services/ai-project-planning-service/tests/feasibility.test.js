const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkFeasibility } = require('../src/validation/feasibility');

describe('feasibility G13', () => {
  it('returns failures structure when flags fail', () => {
    const out = checkFeasibility({
      runId: 'r1',
      snapshotId: 'SNAP-1',
      flags: { coverage: false, resource: true, schedule: false },
    });
    assert.equal(out.pass, false);
    assert.ok(Array.isArray(out.failures));
    assert.ok(out.failures.some((f) => f.code === 'FEAS_COVERAGE'));
    assert.ok(out.failures.some((f) => f.code === 'FEAS_SCHEDULE'));
    assert.ok(Array.isArray(out.evidenceRefs));
    assert.ok(out.evidenceRefs.length >= 1);
  });

  it('passes when all flags ok', () => {
    const out = checkFeasibility({ flags: {} });
    assert.equal(out.pass, true);
    assert.deepEqual(out.failures, []);
  });

  it('ignores high confidence — confidence ≠ pass (Track C)', () => {
    const out = checkFeasibility({
      confidence: 0.99,
      confidenceScore: 1,
      flags: { coverage: false, resource: true, schedule: true },
    });
    assert.equal(out.pass, false);
    assert.equal(out.confidenceIgnored, true);
    assert.ok(out.failures.some((f) => f.code === 'FEAS_COVERAGE'));
  });
});
