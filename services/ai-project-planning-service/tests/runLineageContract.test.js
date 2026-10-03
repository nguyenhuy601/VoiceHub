const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeGenerationId,
  assertParentRunAllowed,
  resolveParentHint,
} = require('../src/contracts/runLineageContract');

describe('runLineageContract', () => {
  it('normalizeGenerationId equals runId string', () => {
    assert.equal(normalizeGenerationId('run-7'), 'run-7');
    assert.equal(normalizeGenerationId(null), null);
  });

  it('assertParentRunAllowed accepts same pack/org phase_what', () => {
    const r = assertParentRunAllowed(
      {
        _id: 'parent-1',
        job: 'phase_what',
        packId: 'pack-a',
        organizationId: 'org-1',
      },
      { packId: 'pack-a', organizationId: 'org-1' }
    );
    assert.equal(r.parentRunId, 'parent-1');
  });

  it('assertParentRunAllowed rejects pack mismatch', () => {
    assert.throws(
      () =>
        assertParentRunAllowed(
          {
            _id: 'parent-1',
            job: 'phase_what',
            packId: 'pack-other',
            organizationId: 'org-1',
          },
          { packId: 'pack-a', organizationId: 'org-1' }
        ),
      (err) => err.code === 'PARENT_RUN_MISMATCH'
    );
  });

  it('assertParentRunAllowed rejects non-what job', () => {
    assert.throws(
      () =>
        assertParentRunAllowed(
          { _id: 'p', job: 'phase_how', packId: 'pack-a', organizationId: 'org-1' },
          { packId: 'pack-a', organizationId: 'org-1' }
        ),
      (err) => err.code === 'PARENT_RUN_INVALID_JOB'
    );
  });

  it('resolveParentHint detects mismatch vs authority', () => {
    const r = resolveParentHint('run-A', 'run-B');
    assert.equal(r.mismatch, true);
    assert.equal(r.parentRunId, 'run-B');
  });
});
