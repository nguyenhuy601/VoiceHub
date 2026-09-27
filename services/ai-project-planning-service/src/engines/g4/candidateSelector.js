/**
 * G4.3 — Candidate selector: which FRs need LLM semantic projection.
 */

const CANDIDATE_FLAGS = new Set([
  'ambiguous',
  'missing_actor',
  'missing_ac',
  'cross_module',
  'thin_text',
  'duplicate',
  'conflict',
  'high_impact',
]);

/**
 * @param {object[]} signals
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ candidates: object[], clear: object[], counts: object }}
 */
function selectCandidates(signals = [], opts = {}) {
  if (opts.enabled === false) {
    return {
      candidates: signals.map((s) => ({ ...s, reason: 'selection_disabled' })),
      clear: [],
      counts: { total: signals.length, candidates: signals.length, clear: 0 },
    };
  }

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
  for (const s of signals) {
    const reasons = [...(s.flags || [])].filter((f) => CANDIDATE_FLAGS.has(f));
    if ((s.priority && String(s.priority).toLowerCase() === 'high') || s.flags?.includes('high_impact')) {
      reasons.push('high_impact');
    }
    // Heuristic conflict: same object mentioned by many FRs with status fields
    if ((s.fields || []).some((f) => /status|trạng thái|trang thai/i.test(f))) {
      for (const obj of s.objects || []) {
        if ((byObjectStatus.get(String(obj)) || []).length >= 2) {
          reasons.push('conflict');
        }
      }
    }
    const uniqReasons = [...new Set(reasons)];
    if (uniqReasons.length) {
      candidates.push({ ...s, reason: uniqReasons.join(','), reasons: uniqReasons });
    } else {
      clear.push(s);
    }
  }

  return {
    candidates,
    clear,
    counts: {
      total: signals.length,
      candidates: candidates.length,
      clear: clear.length,
      ambiguous: candidates.filter((c) => c.reasons?.includes('ambiguous')).length,
      missing: candidates.filter((c) =>
        c.reasons?.some((r) => r.startsWith('missing'))
      ).length,
      conflict: candidates.filter((c) => c.reasons?.includes('conflict')).length,
      crossModule: candidates.filter((c) => c.reasons?.includes('cross_module')).length,
    },
  };
}

function needsSemanticLlm(selection) {
  return Array.isArray(selection?.candidates) && selection.candidates.length > 0;
}

function needsConflictLlm(selection) {
  return (selection?.candidates || []).some((c) => c.reasons?.includes('conflict'));
}

module.exports = {
  CANDIDATE_FLAGS,
  selectCandidates,
  needsSemanticLlm,
  needsConflictLlm,
};
