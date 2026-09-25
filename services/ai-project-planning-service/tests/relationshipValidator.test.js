const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRelationships,
  findCycles,
} = require('../src/validation/relationshipValidator');
const { _resetEvidenceSeqForTests, createEvidence } = require('../src/evidence/evidence');

describe('relationshipValidator', () => {
  before(() => {
    _resetEvidenceSeqForTests();
  });

  it('accepts relationships with evidence and existing targets', () => {
    const ev = createEvidence({
      sourceType: 'srs_pack',
      sourceId: 'FR-1',
      metric: 'dependency',
      value: 'FR-2',
      calculatedBy: 'test',
    });
    const result = validateRelationships({
      requirements: [{ id: 'FR-1' }, { id: 'FR-2' }],
      relationships: [{ from: 'FR-1', to: 'FR-2', type: 'depends_on', evidence: [ev] }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected.length, 0);
  });

  it('rejects missing target', () => {
    const ev = createEvidence({ sourceType: 't', sourceId: 'FR-1', calculatedBy: 't' });
    const result = validateRelationships({
      requirements: [{ id: 'FR-1' }],
      relationships: [{ from: 'FR-1', to: 'FR-MISSING', evidence: [ev] }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === 'REL_TARGET_MISSING'));
  });

  it('rejects missing evidence', () => {
    const result = validateRelationships({
      requirements: [{ id: 'A' }, { id: 'B' }],
      relationships: [{ from: 'A', to: 'B', type: 'depends_on' }],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === 'REL_EVIDENCE_REQUIRED'));
  });

  it('detects circular relationships', () => {
    const cycles = findCycles([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
    ]);
    assert.ok(cycles.length >= 1);

    const ev = () =>
      createEvidence({ sourceType: 't', sourceId: 'x', calculatedBy: 't' });
    const result = validateRelationships({
      requirements: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      relationships: [
        { from: 'A', to: 'B', evidence: [ev()] },
        { from: 'B', to: 'C', evidence: [ev()] },
        { from: 'C', to: 'A', evidence: [ev()] },
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === 'REL_CIRCULAR'));
  });
});
