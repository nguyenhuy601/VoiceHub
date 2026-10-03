const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateRequirementIntegrityGate,
  evaluateConflictAmbiguityGate,
} = require('../src/validation/requirementIntegrityGate');

describe('requirementIntegrityGate B2+R1', () => {
  it('passes when clean', () => {
    const gate = evaluateRequirementIntegrityGate({
      g4Understanding: {
        ambiguities: [],
        evidence: [{ evidenceId: 'EV-1' }],
        meta: { validationOk: true },
      },
      validation: { ok: true, errors: [], rejected: [] },
    });
    assert.equal(gate.passed, true);
    assert.equal(gate.blocking.length, 0);
    assert.equal(gate.warnings.length, 0);
    assert.equal(gate.gateKind, 'requirement_integrity');
  });

  it('blocks incomplete_fields as data_integrity with missing[]', () => {
    const gate = evaluateRequirementIntegrityGate({
      g4Understanding: {
        ambiguities: [
          {
            requirementId: 'CR-001',
            kind: 'incomplete_fields',
            missing: ['Description', 'Priority'],
          },
        ],
      },
      validation: { ok: true, errors: [], rejected: [] },
    });
    assert.equal(gate.passed, false);
    assert.equal(gate.blocking[0].blockKind, 'data_integrity');
    assert.equal(gate.blocking[0].kind, 'incomplete_fields');
    assert.deepEqual(gate.blocking[0].missing, ['Description', 'Priority']);
    assert.ok(gate.ambiguities.some((a) => a.blockKind === 'ambiguity'));
  });

  it('does not hard-block semantic vague ambiguity', () => {
    const gate = evaluateRequirementIntegrityGate({
      g4Understanding: {
        ambiguities: [
          { requirementId: 'FR-1', kind: 'vague', message: 'unclear AC' },
        ],
      },
      validation: { ok: true, errors: [], rejected: [] },
    });
    assert.equal(gate.passed, true);
    assert.equal(gate.blocking.length, 0);
  });

  it('blocks REL_CIRCULAR as relationship_integrity', () => {
    const gate = evaluateRequirementIntegrityGate({
      g4Understanding: { ambiguities: [] },
      validation: {
        ok: false,
        errors: [{ code: 'REL_CIRCULAR', cycle: ['A', 'B', 'A'] }],
        rejected: [],
      },
    });
    assert.equal(gate.passed, false);
    assert.equal(gate.blocking[0].blockKind, 'relationship_integrity');
    assert.equal(gate.blocking[0].code, 'REL_CIRCULAR');
  });

  it('B2: REL_EVIDENCE_REQUIRED is warning only', () => {
    const gate = evaluateRequirementIntegrityGate({
      g4Understanding: { ambiguities: [] },
      validation: {
        ok: false,
        errors: [
          { code: 'REL_EVIDENCE_REQUIRED', from: 'FR-1', to: 'FR-2' },
        ],
        rejected: [
          {
            from: 'FR-1',
            to: 'FR-2',
            validationError: 'REL_EVIDENCE_REQUIRED',
          },
        ],
      },
    });
    assert.equal(gate.passed, true);
    assert.equal(gate.blocking.length, 0);
    assert.ok(gate.warnings.length >= 1);
    assert.equal(gate.warnings[0].code, 'REL_EVIDENCE_REQUIRED');
    assert.equal(gate.warnings[0].severity, 'warn');
  });

  it('alias evaluateConflictAmbiguityGate matches', () => {
    const a = evaluateRequirementIntegrityGate({
      g4Understanding: {
        ambiguities: [
          { requirementId: 'X', kind: 'incomplete_fields', missing: ['AC'] },
        ],
      },
    });
    const b = evaluateConflictAmbiguityGate({
      g4Understanding: {
        ambiguities: [
          { requirementId: 'X', kind: 'incomplete_fields', missing: ['AC'] },
        ],
      },
    });
    assert.equal(a.passed, b.passed);
    assert.equal(a.blocking[0].blockKind, b.blocking[0].blockKind);
  });
});
