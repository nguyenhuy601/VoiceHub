const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  G2_SOURCE_IDS,
  G2_SOURCE_FIELD_MANIFEST,
  G3_CATALOG_MISS_POLICY,
  fieldsForSource,
  assertSnapshotBind,
  validateG6CanonicalEnvelope,
} = require('../src/knowledge/g2G3G6Deps');

describe('G2/G3/G6 dependency contract', () => {
  it('G2 field manifest covers core sources', () => {
    assert.ok(G2_SOURCE_IDS.includes('srs_pack'));
    assert.ok(G2_SOURCE_FIELD_MANIFEST.employee_pool.includes('userId'));
    assert.ok(fieldsForSource('skill_catalog').includes('version'));
    assert.equal(fieldsForSource('unknown'), null);
  });

  it('G3 catalog-miss policy is frozen', () => {
    assert.equal(G3_CATALOG_MISS_POLICY.skill, 'error');
    assert.equal(G3_CATALOG_MISS_POLICY.metric, 'error');
    assert.equal(G3_CATALOG_MISS_POLICY.dimension, 'warn');
  });

  it('assertSnapshotBind enforces RULE-09', () => {
    assert.throws(() => assertSnapshotBind({}), /snapshotId/);
    const b = assertSnapshotBind({ snapshotId: 'SNAP-1', runId: 'RUN-1' });
    assert.equal(b.snapshotId, 'SNAP-1');
    assert.equal(b.runId, 'RUN-1');
  });

  it('validateG6CanonicalEnvelope requires approved status', () => {
    const bad = validateG6CanonicalEnvelope({
      approvedSrsVersion: '1',
      status: 'draft',
      functionalRequirements: [],
      nonFunctionalRequirements: [],
    });
    assert.equal(bad.ok, false);

    const good = validateG6CanonicalEnvelope({
      approvedSrsVersion: 'v3',
      status: 'approved',
      functionalRequirements: [],
      nonFunctionalRequirements: [],
    });
    assert.equal(good.ok, true);
  });
});
