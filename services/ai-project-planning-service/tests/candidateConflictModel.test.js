/**
 * W1 Conflict pair model — NormalizedConstraintFact + PotentialConflict + baseline.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  selectCandidates,
  selectCandidatesLegacyStatusObjectConflict,
} = require('../src/engines/g4/candidateSelector');
const {
  buildTargetKey,
  normalizeConstraintFact,
  emitConstraintFactsFromSignals,
  SUPPORTED_CONSTRAINT_TYPES,
} = require('../src/engines/g4/normalizedConstraintFact');
const {
  canonicalPairKey,
  buildPotentialConflictRelations,
} = require('../src/engines/g4/conflictRelations');
const { buildGatePreview } = require('../src/engines/g4/pipelineProgress');
const { runConflictProjection } = require('../src/engines/g4/semanticProjection');

const FIX = path.join(__dirname, 'fixtures', 'candidateConflict');
const signals = require('./fixtures/candidateConflict/signals-status-shared.json');

describe('W1 baseline before/after', () => {
  it('captures before.json (legacy FP) and after.json (current)', () => {
    require('./fixtures/candidateConflict/captureBaseline.js');
    const before = JSON.parse(
      fs.readFileSync(path.join(FIX, 'baseline', 'before.json'), 'utf8')
    );
    const after = JSON.parse(
      fs.readFileSync(path.join(FIX, 'baseline', 'after.json'), 'utf8')
    );
    assert.ok(before.candidates >= after.candidates);
    assert.ok(before.legacyConflictFrCount >= 2, 'legacy FP stamps status+shared');
    assert.equal(after.legacyConflictFrCount, 0);
    assert.equal(after.conflicts.pairCount, 0, 'no structured facts → no pairs');
    assert.equal(after.byReason.potential_conflict, 0);
    assert.equal(after.invariant, true);
    assert.ok(Array.isArray(before.byReasonSchema));
    assert.ok(before.pairCountSchema);
  });

  it('legacy selector still proves FP for regression audit', () => {
    const legacy = selectCandidatesLegacyStatusObjectConflict(signals);
    assert.ok(legacy.counts.legacyConflictFrCount >= 2);
  });
});

describe('NormalizedConstraintFact contract', () => {
  it('buildTargetKey normalizes object.action.field', () => {
    assert.equal(buildTargetKey('Enrollment', 'Update', 'Status'), 'enrollment.update.status');
  });

  it('only supports inventory types (actor_policy in W1)', () => {
    assert.deepEqual([...SUPPORTED_CONSTRAINT_TYPES], ['actor_policy']);
    assert.equal(
      normalizeConstraintFact({
        frId: 'FR-1',
        constraintType: 'allowed_values',
        targetKey: 'a.b.c',
        constraintValue: {},
      }),
      null
    );
  });

  it('emitConstraintFactsFromSignals returns [] (no keyword parser)', () => {
    assert.deepEqual(emitConstraintFactsFromSignals(signals), []);
  });
});

describe('Business matrix', () => {
  it('shared object alone → no conflict', () => {
    const built = buildPotentialConflictRelations([]);
    const sel = selectCandidates(
      [
        { frId: 'A', flags: [], objects: ['X'], fields: [], actors: ['a'], text: 'ok' },
        { frId: 'B', flags: [], objects: ['X'], fields: [], actors: ['b'], text: 'ok' },
      ],
      { conflictRelations: built.relations }
    );
    assert.equal(sel.conflicts.pairCount, 0);
    assert.equal(sel.counts.byReason.potential_conflict, 0);
  });

  it('same object + same field → no conflict', () => {
    const built = buildPotentialConflictRelations([]);
    const sel = selectCandidates(
      [
        {
          frId: 'A',
          flags: [],
          objects: ['Enrollment'],
          fields: ['status'],
          actors: ['a'],
          text: 'ok',
        },
        {
          frId: 'B',
          flags: [],
          objects: ['Enrollment'],
          fields: ['status'],
          actors: ['b'],
          text: 'ok',
        },
      ],
      { conflictRelations: built.relations }
    );
    assert.equal(sel.conflicts.pairCount, 0);
  });

  it('status + shared object → no conflict (FP removed)', () => {
    const current = selectCandidates(signals, {
      conflictRelations: buildPotentialConflictRelations([]).relations,
    });
    assert.equal(current.conflicts.pairCount, 0);
    assert.ok(!current.candidates.some((c) => (c.reasons || []).includes('conflict')));
  });

  it('view vs filter → no conflict', () => {
    const facts = [
      {
        frId: 'FR-V',
        targetKey: 'enrollment.view.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW', actors: ['STUDENT'] },
      },
      {
        frId: 'FR-F',
        targetKey: 'enrollment.filter.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW', actors: ['ADMIN'] },
      },
    ];
    const built = buildPotentialConflictRelations(facts);
    assert.equal(built.pairCount, 0);
  });

  it('incompatible permission (structured actor_policy) → potential conflict', () => {
    const facts = [
      {
        frId: 'FR-01',
        targetKey: 'enrollment.update.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['ADMIN'] },
        sourceRef: { kind: 'field', path: 'permission' },
      },
      {
        frId: 'FR-02',
        targetKey: 'enrollment.update.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW', actors: ['STUDENT'] },
        sourceRef: { kind: 'field', path: 'permission' },
      },
    ];
    const built = buildPotentialConflictRelations(facts);
    assert.equal(built.pairCount, 1);
    assert.equal(built.affectedFrCount, 2);
    assert.equal(built.relations[0].pairKey, canonicalPairKey('FR-01', 'FR-02'));
    assert.equal(built.relations[0].relation, 'incompatible');

    const sel = selectCandidates(
      [
        { frId: 'FR-01', flags: [], actors: ['Admin'], objects: ['Enrollment'], fields: ['status'], text: 'a' },
        { frId: 'FR-02', flags: [], actors: ['Student'], objects: ['Enrollment'], fields: ['status'], text: 'b' },
      ],
      { conflictRelations: built.relations }
    );
    assert.equal(sel.counts.byReason.potential_conflict, sel.conflicts.affectedFrCount);
    assert.equal(sel.counts.byReason.potential_conflict, 2);
  });

  it('allowed_values / state_transition skip when type not in inventory', () => {
    const built = buildPotentialConflictRelations([
      {
        frId: 'A',
        targetKey: 'x.y.z',
        constraintType: 'allowed_values',
        constraintValue: { values: [1] },
      },
      {
        frId: 'B',
        targetKey: 'x.y.z',
        constraintType: 'allowed_values',
        constraintValue: { values: [2] },
      },
    ]);
    assert.equal(built.pairCount, 0);
  });

  it('same permission same rule → no conflict', () => {
    const facts = [
      {
        frId: 'FR-A',
        targetKey: 'enrollment.update.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['ADMIN'] },
      },
      {
        frId: 'FR-B',
        targetKey: 'enrollment.update.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['ADMIN'] },
      },
    ];
    assert.equal(buildPotentialConflictRelations(facts).pairCount, 0);
  });

  it('prose-only no facts → no new pair', () => {
    assert.equal(buildPotentialConflictRelations([]).pairCount, 0);
    assert.deepEqual(emitConstraintFactsFromSignals([{ frId: 'X', text: 'must only admin' }]), []);
  });
});

describe('Technical invariants', () => {
  it('FR01↔FR02 and FR02↔FR01 → 1 pair', () => {
    assert.equal(canonicalPairKey('FR-02', 'FR-01'), canonicalPairKey('FR-01', 'FR-02'));
    const facts = [
      {
        frId: 'FR-01',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['A'] },
      },
      {
        frId: 'FR-02',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['B'] },
      },
    ];
    assert.equal(buildPotentialConflictRelations(facts).pairCount, 1);
  });

  it('no self-pair', () => {
    const facts = [
      {
        frId: 'FR-01',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['A'] },
      },
      {
        frId: 'FR-01',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['B'] },
      },
    ];
    assert.equal(buildPotentialConflictRelations(facts).pairCount, 0);
  });

  it('same object different action → no conflict', () => {
    const facts = [
      {
        frId: 'FR-01',
        targetKey: 'enrollment.update.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['ADMIN'] },
      },
      {
        frId: 'FR-02',
        targetKey: 'enrollment.view.status',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW', actors: ['STUDENT'] },
      },
    ];
    assert.equal(buildPotentialConflictRelations(facts).pairCount, 0);
  });
});

describe('Data Gate observability + high_impact audit', () => {
  it('byReason.potential_conflict === conflicts.affectedFrCount', () => {
    const facts = [
      {
        frId: 'FR-01',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['A'] },
      },
      {
        frId: 'FR-02',
        targetKey: 't.a.f',
        constraintType: 'actor_policy',
        constraintValue: { mode: 'ALLOW_ONLY', actors: ['B'] },
      },
    ];
    const built = buildPotentialConflictRelations(facts);
    const sel = selectCandidates(
      [
        { frId: 'FR-01', flags: [], priority: 'high', actors: [], objects: [], fields: [], text: 'a' },
        { frId: 'FR-02', flags: [], actors: [], objects: [], fields: [], text: 'b' },
      ],
      { conflictRelations: built.relations }
    );
    assert.equal(sel.counts.byReason.potential_conflict, sel.conflicts.affectedFrCount);
    assert.equal(sel.counts.byReason.high_impact, 1, 'audit: priority===high only');
    const preview = buildGatePreview({
      functionalRequirements: [
        { id: 'FR-01', title: 'a' },
        { id: 'FR-02', title: 'b' },
      ],
      signals: [
        { frId: 'FR-01', flags: [], actors: [], actions: [], objects: [], fields: [] },
        { frId: 'FR-02', flags: [], actors: [], actions: [], objects: [], fields: [] },
      ],
      selection: sel,
    });
    assert.equal(preview.conflicts.pairCount, 1);
    assert.equal(preview.byReason.potential_conflict, 2);
    assert.equal(preview.byReason.high_impact, 1);
  });
});

describe('LLM conflict verdict 3-way', () => {
  it('maps CONFIRMED|REJECTED|UNCLEAR; only CONFIRMED enter conflicts[]', async () => {
    const conf = await runConflictProjection({
      generateJson: async () => ({
        ok: true,
        data: {
          verdicts: [
            { pairKey: 'FR-01::FR-02', verdict: 'CONFIRMED', reason: 'yes', evidence: [] },
            { pairKey: 'FR-03::FR-04', verdict: 'REJECTED', reason: 'no', evidence: [] },
            { pairKey: 'FR-05::FR-06', verdict: 'UNCLEAR', reason: '?', evidence: [] },
          ],
        },
      }),
      batch: [{ pairKey: 'FR-01::FR-02', frIds: ['FR-01', 'FR-02'] }],
      policy: { enabled: true, maxOutputTokens: 128 },
    });
    assert.equal(conf.verdicts.length, 3);
    assert.equal(conf.conflicts.length, 1);
    assert.equal(conf.conflicts[0].verdict, 'CONFIRMED');
  });
});
