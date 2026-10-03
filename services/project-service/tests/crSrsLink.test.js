const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  normalizeAffectedExternalKeys,
  assertCrSrsLinkFields,
} = require('../src/utils/work/crSrsLink');

describe('crSrsLink (R5)', () => {
  it('normalizes keys unique uppercase-dedupe', () => {
    assert.deepEqual(normalizeAffectedExternalKeys(['FR-1', 'fr-1', 'UC-2', '']), ['FR-1', 'UC-2']);
  });

  it('requires baseline+keys for requirement_change after SRS', () => {
    const bad = assertCrSrsLinkFields({
      type: 'requirement_change',
      projectHasSrsBaseline: true,
      srsBaselineId: null,
      affectedExternalKeys: [],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.errorCode, 'CR_SRS_BASELINE_REQUIRED');

    const ok = assertCrSrsLinkFields({
      type: 'requirement_change',
      projectHasSrsBaseline: true,
      srsBaselineId: '507f1f77bcf86cd799439011',
      affectedExternalKeys: ['FR-1'],
      baselineBelongsToProject: true,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.srsBaselineId, '507f1f77bcf86cd799439011');
    assert.deepEqual(ok.affectedExternalKeys, ['FR-1']);
  });

  it('does not require link for other types', () => {
    const r = assertCrSrsLinkFields({
      type: 'technical_change',
      projectHasSrsBaseline: true,
      srsBaselineId: null,
      affectedExternalKeys: [],
    });
    assert.equal(r.ok, true);
  });
});
