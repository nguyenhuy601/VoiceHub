/**
 * G4 evidenceBuilder metric must resolve in G1 catalog (RULE-10).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveMetric } = require('../src/knowledge/g1CatalogSchemas');
const { createEvidence } = require('../src/evidence/evidence');

describe('G1 metric semantic_projection', () => {
  it('resolves in METRIC_CATALOG_SEED', () => {
    const entry = resolveMetric('semantic_projection');
    assert.ok(entry);
    assert.equal(entry.metricId, 'semantic_projection');
    assert.equal(entry.ruleId, 'G4-SEM-001');
  });

  it('createEvidence accepts semantic_projection when enforce on', () => {
    const ev = createEvidence({
      sourceType: 'llm_candidate',
      sourceId: 'FR-1',
      snapshotId: 'snap-1',
      metric: 'semantic_projection',
      value: 'capability',
      calculatedBy: 'G4:semanticProjection',
      ruleId: 'G4-SEM-001',
    });
    assert.equal(ev.metric, 'semantic_projection');
    assert.ok(ev.evidenceId);
  });
});
