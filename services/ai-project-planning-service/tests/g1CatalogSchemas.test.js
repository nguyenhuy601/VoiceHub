const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  G1_CONTRACT_VERSION,
  METRIC_CATALOG_SEED,
  resolveMetric,
  validateSkillCatalog,
  validateVectorDocument,
  catalogMiss,
} = require('../src/knowledge/g1CatalogSchemas');

describe('G1 catalog contract', () => {
  it('exposes contract version and seed metrics', () => {
    assert.equal(G1_CONTRACT_VERSION, 'g1.catalog.v1');
    assert.ok(METRIC_CATALOG_SEED.length >= 4);
    assert.ok(resolveMetric('available_capacity'));
    assert.equal(resolveMetric('available_capacity').unit, 'hours');
    assert.equal(resolveMetric('nope'), null);
  });

  it('validateSkillCatalog accepts stub string list and promotes entries', () => {
    const out = validateSkillCatalog({
      version: 'cap-whitelist-v2',
      skills: ['React', 'Node.js'],
    });
    assert.equal(out.ok, true);
    assert.equal(out.catalog.skills.length, 2);
    assert.ok(out.catalog.skills[0].skillId.startsWith('skill:'));
  });

  it('validateSkillCatalog rejects missing version', () => {
    const out = validateSkillCatalog({ skills: [] });
    assert.equal(out.ok, false);
    assert.ok(out.errors.some((e) => /version/.test(e)));
  });

  it('validateVectorDocument requires snapshotId (RULE-09)', () => {
    const bad = validateVectorDocument({
      sourceId: 'DOC-1',
      docType: 'evidence_span',
      text: 'hello',
      metadata: {},
    });
    assert.equal(bad.ok, false);

    const good = validateVectorDocument({
      sourceId: 'DOC-1',
      docType: 'metric_def',
      text: 'available_capacity = available - committed',
      metadata: { snapshotId: 'SNAP-1', metricId: 'available_capacity' },
    });
    assert.equal(good.ok, true);
  });

  it('catalogMiss returns G1_CATALOG_MISS', () => {
    const m = catalogMiss('metric', 'unknown_x', 'error');
    assert.equal(m.code, 'G1_CATALOG_MISS');
    assert.equal(m.severity, 'error');
  });
});
