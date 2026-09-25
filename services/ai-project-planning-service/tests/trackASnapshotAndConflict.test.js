const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertSnapshotBoundary,
} = require('../src/knowledge/assertSnapshotBoundary');
const {
  evaluateConflictAmbiguityGate,
} = require('../src/validation/evaluateConflictAmbiguityGate');

describe('Track A snapshot boundary', () => {
  it('requires snapshotId', () => {
    assert.throws(
      () => assertSnapshotBoundary({ snapshot: { overview: {} } }),
      (err) => err.code === 'SNAPSHOT_BIND_REQUIRED'
    );
  });

  it('requires snapshot payload', () => {
    assert.throws(
      () =>
        assertSnapshotBoundary({
          snapshotId: 'SNAP-1',
          snapshot: null,
        }),
      (err) => err.code === 'SNAPSHOT_PAYLOAD_REQUIRED'
    );
  });

  it('rejects empty payload (pack-only hole)', () => {
    assert.throws(
      () =>
        assertSnapshotBoundary({
          snapshotId: 'SNAP-1',
          snapshot: { snapshotId: 'SNAP-1' },
        }),
      (err) => err.code === 'SNAPSHOT_EMPTY'
    );
  });

  it('accepts domain snapshot and stamps id', () => {
    const snap = { overview: { requirementName: 'X' } };
    const out = assertSnapshotBoundary({
      snapshotId: 'SNAP-1',
      snapshot: snap,
    });
    assert.equal(out.snapshotId, 'SNAP-1');
    assert.equal(out.snapshot.snapshotId, 'SNAP-1');
  });
});

describe('Track A conflictAmbiguityGate', () => {
  it('passes when no ambiguities/conflicts', () => {
    const gate = evaluateConflictAmbiguityGate({
      g4Understanding: {
        ambiguities: [],
        rejectedRelationships: [],
        evidence: [{ evidenceId: 'EV-1' }],
        meta: { validationOk: true },
      },
      validation: { ok: true, errors: [], rejected: [] },
    });
    assert.equal(gate.passed, true);
    assert.equal(gate.blocking.length, 0);
  });

  it('fails when ambiguities present — confidence does not clear', () => {
    const gate = evaluateConflictAmbiguityGate({
      g4Understanding: {
        ambiguities: [{ requirementId: 'FR-1', kind: 'vague', message: 'unclear AC' }],
        evidence: [],
        meta: { validationOk: true },
      },
      validation: { ok: true, errors: [], rejected: [] },
    });
    assert.equal(gate.passed, false);
    assert.equal(gate.confidenceDoesNotClearGate, true);
    assert.ok(gate.blocking.some((b) => b.blockKind === 'ambiguity'));
  });

  it('fails on circular relationship conflict', () => {
    const gate = evaluateConflictAmbiguityGate({
      g4Understanding: { ambiguities: [], evidence: [] },
      validation: {
        ok: false,
        errors: [{ code: 'REL_CIRCULAR', cycle: ['A', 'B', 'A'] }],
        rejected: [],
      },
    });
    assert.equal(gate.passed, false);
    assert.ok(gate.conflicts.some((c) => c.kind === 'circular_relationship'));
  });
});
