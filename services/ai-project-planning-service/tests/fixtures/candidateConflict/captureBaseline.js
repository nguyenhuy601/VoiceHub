/**
 * Capture before.json (legacy status+shared FP) and after.json (current pair model).
 * Run: node tests/fixtures/candidateConflict/captureBaseline.js
 */
const fs = require('fs');
const path = require('path');
const {
  selectCandidates,
  selectCandidatesLegacyStatusObjectConflict,
} = require('../../../src/engines/g4/candidateSelector');
const { buildPotentialConflictRelations } = require('../../../src/engines/g4/conflictRelations');
const { emitConstraintFactsFromSignals } = require('../../../src/engines/g4/normalizedConstraintFact');
const { buildGatePreview } = require('../../../src/engines/g4/pipelineProgress');

const signals = require('./signals-status-shared.json');

const legacy = selectCandidatesLegacyStatusObjectConflict(signals);
const before = {
  schema: 'candidateConflictBaseline.v1',
  capturedAt: new Date().toISOString(),
  note: 'LEGACY status+shared object → conflict (FP). Not used in production.',
  signalsCount: signals.length,
  candidates: legacy.counts.candidates,
  clear: legacy.counts.clear,
  legacyConflictFrCount: legacy.counts.legacyConflictFrCount,
  candidateFrIds: legacy.candidates.map((c) => c.frId),
  clearFrIds: legacy.clear.map((c) => c.frId),
  byReasonSchema: [
    'missing_actor',
    'missing_ac',
    'thin_text',
    'ambiguous',
    'duplicate',
    'cross_module',
    'potential_conflict',
    'high_impact',
  ],
  pairCountSchema: { pairCount: 'number', affectedFrCount: 'number' },
};

const facts = emitConstraintFactsFromSignals(signals);
const conflictBuilt = buildPotentialConflictRelations(facts);
const current = selectCandidates(signals, { conflictRelations: conflictBuilt.relations });
const preview = buildGatePreview({
  functionalRequirements: signals.map((s) => ({ id: s.frId, title: s.text, description: s.text })),
  signals,
  duplicates: [],
  selection: current,
});

const after = {
  schema: 'candidateConflictBaseline.v1',
  capturedAt: new Date().toISOString(),
  note: 'Current: no status+shared FP; potential_conflict only from structured PotentialConflict relations.',
  signalsCount: signals.length,
  candidates: current.counts.candidates,
  clear: current.counts.clear,
  legacyConflictFrCount: 0,
  byReason: current.counts.byReason,
  conflicts: {
    pairCount: current.conflicts.pairCount,
    affectedFrCount: current.conflicts.affectedFrCount,
  },
  invariant:
    current.counts.byReason.potential_conflict === current.conflicts.affectedFrCount,
  candidateFrIds: current.candidates.map((c) => c.frId),
  clearFrIds: current.clear.map((c) => c.frId),
  gatePreview: {
    candidateCount: preview.candidateCount,
    byReason: preview.byReason,
    conflicts: preview.conflicts,
  },
  deltaVsLegacy: {
    candidatesBefore: before.candidates,
    candidatesAfter: current.counts.candidates,
    legacyConflictRemoved: legacy.counts.legacyConflictFrCount,
    note: 'FP removal drops candidates that only had status+shared conflict stamp',
  },
};

const dir = path.join(__dirname, 'baseline');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'before.json'), `${JSON.stringify(before, null, 2)}\n`);
fs.writeFileSync(path.join(dir, 'after.json'), `${JSON.stringify(after, null, 2)}\n`);
console.log('Wrote baseline before.json / after.json');
console.log(
  JSON.stringify(
    {
      before: { candidates: before.candidates, legacyConflict: before.legacyConflictFrCount },
      after: {
        candidates: after.candidates,
        pairCount: after.conflicts.pairCount,
        byReason: after.byReason,
      },
    },
    null,
    2
  )
);
