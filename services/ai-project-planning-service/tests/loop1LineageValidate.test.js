const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertParentRunAllowed,
  resolveParentHint,
} = require('../src/contracts/runLineageContract');

/** T2 — parentRunId pack mismatch → reject; FE hint ≠ authority → mismatch */
describe('loop1LineageValidate T2', () => {
  it('rejects parent from another pack', () => {
    assert.throws(
      () =>
        assertParentRunAllowed(
          {
            _id: 'parent-x',
            job: 'phase_what',
            packId: 'pack-other',
            organizationId: 'org-1',
          },
          { packId: 'pack-current', organizationId: 'org-1' }
        ),
      (err) => err.code === 'PARENT_RUN_MISMATCH' && err.statusCode === 409
    );
  });

  it('resolveParentHint: FE stale hint vs authority marks mismatch', () => {
    const r = resolveParentHint('run-stale', 'run-current');
    assert.equal(r.mismatch, true);
    assert.equal(r.parentRunId, 'run-current');
  });

  it('authority alone is enough when hint omitted', () => {
    const r = resolveParentHint(null, 'run-current');
    assert.equal(r.mismatch, false);
    assert.equal(r.parentRunId, 'run-current');
  });
});
