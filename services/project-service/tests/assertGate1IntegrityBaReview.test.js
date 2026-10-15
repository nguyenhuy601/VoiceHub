const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertGate1ConflictAmbiguityOrOverride,
  filterIntegrityBlockingByBaReview,
} = require('../src/utils/tools/assertGate1ConflictAmbiguityOrOverride');

function packWithGate({ blocking, items, decisions }) {
  return {
    aiAnalysis: {
      analyses: {
        g4Understanding: {
          requirementIntegrityGate: {
            passed: false,
            blocking,
            warnings: [],
          },
        },
        srsProposal: {
          generated: {
            functionalRequirements: { items },
          },
          review: { decisions: decisions || {} },
        },
      },
    },
  };
}

describe('assertGate1IntegrityBaReview', () => {
  it('clears missing Acceptance criteria after BA edit on proposal', () => {
    const pack = packWithGate({
      blocking: [
        {
          blockKind: 'data_integrity',
          kind: 'incomplete_fields',
          requirementId: 'CR-001',
          missing: ['Acceptance criteria'],
        },
      ],
      items: [{ logicalId: 'CR-001', title: 'FR', ac: 'chức năng chạy được' }],
      decisions: {
        'CR-001': {
          action: 'edit',
          editedPayload: { ac: 'chức năng chạy được' },
        },
      },
    });
    const remaining = filterIntegrityBlockingByBaReview(
      pack,
      pack.aiAnalysis.analyses.g4Understanding.requirementIntegrityGate.blocking
    );
    assert.equal(remaining.length, 0);
    const result = assertGate1ConflictAmbiguityOrOverride({ pack });
    assert.equal(result.ok, true);
    assert.equal(result.gate.passed, true);
  });

  it('drops integrity issue when BA rejected the row', () => {
    const pack = packWithGate({
      blocking: [
        {
          blockKind: 'data_integrity',
          kind: 'incomplete_fields',
          requirementId: 'CR-002',
          missing: ['Acceptance criteria'],
        },
      ],
      items: [{ logicalId: 'CR-002', title: 'FR', ac: '' }],
      decisions: { 'CR-002': { action: 'reject' } },
    });
    const result = assertGate1ConflictAmbiguityOrOverride({ pack });
    assert.equal(result.ok, true);
    assert.equal(result.gate.passed, true);
  });

  it('still blocks when AC remains empty after accept', () => {
    const pack = packWithGate({
      blocking: [
        {
          blockKind: 'data_integrity',
          kind: 'incomplete_fields',
          requirementId: 'CR-003',
          missing: ['Acceptance criteria'],
        },
      ],
      items: [{ logicalId: 'CR-003', title: 'FR', ac: '' }],
      decisions: { 'CR-003': { action: 'accept' } },
    });
    assert.throws(
      () => assertGate1ConflictAmbiguityOrOverride({ pack }),
      (err) => err.errorCode === 'CONFLICT_AMBIGUITY_BLOCKING'
    );
  });
});
