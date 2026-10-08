/**
 * G4.3 — Candidate selector: quality reasons + consumed conflict relations + high_impact.
 * Does NOT discover semantic conflict from lexical keywords.
 * status + shared object NEVER means conflict (W1).
 */

const CANDIDATE_FLAGS = new Set([
  'ambiguous',
  'missing_actor',
  'missing_ac',
  'cross_module',
  'thin_text',
  'duplicate',
  'potential_conflict',
  // legacy alias kept for reading old flags only — never emitted by status+shared heuristic
  'conflict',
  'high_impact',
]);

const REASON_KEYS = [
  'missing_actor',
  'missing_ac',
  'thin_text',
  'ambiguous',
  'duplicate',
  'cross_module',
  'potential_conflict',
  'high_impact',
];

/**
 * Audit note (W1): high_impact currently comes from structured `priority === 'high'`
 * or explicit flag — not an English keyword bag. Semantics intentionally unchanged in W1.
 */
function collectHighImpact(signal) {
  if (signal.priority && String(signal.priority).toLowerCase() === 'high') return true;
  if (Array.isArray(signal.flags) && signal.flags.includes('high_impact')) return true;
  return false;
}

function emptyByReason() {
  return Object.fromEntries(REASON_KEYS.map((k) => [k, 0]));
}

/**
 * @param {object[]} signals
 * @param {{ enabled?: boolean, conflictRelations?: object[] }} [opts]
 */
function selectCandidates(signals = [], opts = {}) {
  const relations = Array.isArray(opts.conflictRelations) ? opts.conflictRelations : [];
  const affectedByConflict = new Set();
  for (const rel of relations) {
    for (const id of rel.frIds || []) affectedByConflict.add(String(id));
  }
  const pairCount = relations.length;
  const affectedFrCount = affectedByConflict.size;

  if (opts.enabled === false) {
    return {
      candidates: signals.map((s) => ({ ...s, reason: 'selection_disabled', reasons: ['selection_disabled'] })),
      clear: [],
      conflicts: { pairCount: 0, affectedFrCount: 0, relations: [] },
      counts: {
        total: signals.length,
        candidates: signals.length,
        clear: 0,
        byReason: emptyByReason(),
        ambiguous: 0,
        missing: 0,
        conflict: 0,
        potential_conflict: 0,
        crossModule: 0,
        high_impact: 0,
      },
    };
  }

  const candidates = [];
  const clear = [];
  const byReason = emptyByReason();

  for (const s of signals) {
    const frId = String(s.frId || '');
    const reasons = [...(s.flags || [])].filter((f) => {
      if (f === 'conflict') return false; // never treat legacy status-shared stamp
      return CANDIDATE_FLAGS.has(f) && f !== 'conflict';
    });

    if (collectHighImpact(s)) {
      reasons.push('high_impact');
    }

    // Consumed pair relations only — no status+shared-object heuristic
    if (affectedByConflict.has(frId)) {
      reasons.push('potential_conflict');
    }

    const uniqReasons = [...new Set(reasons)];
    for (const r of uniqReasons) {
      if (byReason[r] != null) byReason[r] += 1;
    }

    if (uniqReasons.length) {
      candidates.push({ ...s, reason: uniqReasons.join(','), reasons: uniqReasons });
    } else {
      clear.push(s);
    }
  }

  // Invariant: byReason.potential_conflict === affectedFrCount
  byReason.potential_conflict = affectedFrCount;

  return {
    candidates,
    clear,
    conflicts: {
      pairCount,
      affectedFrCount,
      relations,
    },
    counts: {
      total: signals.length,
      candidates: candidates.length,
      clear: clear.length,
      byReason,
      ambiguous: byReason.ambiguous,
      missing: byReason.missing_actor + byReason.missing_ac,
      conflict: affectedFrCount, // legacy alias → affected FR count
      potential_conflict: affectedFrCount,
      crossModule: byReason.cross_module,
      high_impact: byReason.high_impact,
    },
  };
}

/**
 * LEGACY — status + shared object → conflict (FALSE POSITIVE).
 * Kept only for baseline before.json capture / regression proof. Do not call in production.
 */
function selectCandidatesLegacyStatusObjectConflict(signals = []) {
  const byObjectStatus = new Map();
  for (const s of signals) {
    for (const obj of s.objects || []) {
      const key = String(obj);
      if (!byObjectStatus.has(key)) byObjectStatus.set(key, []);
      byObjectStatus.get(key).push(s.frId);
    }
  }
  const candidates = [];
  const clear = [];
  let legacyConflict = 0;
  for (const s of signals) {
    const reasons = [...(s.flags || [])];
    if ((s.fields || []).some((f) => /status|trạng thái|trang thai/i.test(f))) {
      for (const obj of s.objects || []) {
        if ((byObjectStatus.get(String(obj)) || []).length >= 2) {
          reasons.push('conflict');
        }
      }
    }
    const uniq = [...new Set(reasons)];
    if (uniq.includes('conflict')) legacyConflict += 1;
    if (uniq.length) candidates.push({ ...s, reasons: uniq });
    else clear.push(s);
  }
  return {
    candidates,
    clear,
    counts: {
      total: signals.length,
      candidates: candidates.length,
      clear: clear.length,
      legacyConflictFrCount: legacyConflict,
    },
  };
}

function needsSemanticLlm(selection) {
  return Array.isArray(selection?.candidates) && selection.candidates.length > 0;
}

function needsConflictLlm(selection) {
  const rels = selection?.conflicts?.relations;
  if (Array.isArray(rels) && rels.length > 0) return true;
  return (selection?.candidates || []).some(
    (c) =>
      c.reasons?.includes('potential_conflict') || c.reasons?.includes('conflict')
  );
}

module.exports = {
  CANDIDATE_FLAGS,
  REASON_KEYS,
  selectCandidates,
  selectCandidatesLegacyStatusObjectConflict,
  needsSemanticLlm,
  needsConflictLlm,
};
