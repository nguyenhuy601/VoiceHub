/**
 * Track A — Conflict + Ambiguity gate (Phase 1, before Gate 1 HITL).
 * Pure evaluation from G4 understanding + relationship validation.
 * Confidence scores do not clear blocking issues.
 */

/**
 * @param {{
 *   g4Understanding?: object|null,
 *   validation?: object|null,
 * }} input
 * @returns {{
 *   passed: boolean,
 *   ambiguities: object[],
 *   conflicts: object[],
 *   blocking: object[],
 *   evidenceBound: boolean,
 * }}
 */
function evaluateConflictAmbiguityGate(input = {}) {
  const g4 = input.g4Understanding && typeof input.g4Understanding === 'object'
    ? input.g4Understanding
    : {};
  const validation =
    input.validation && typeof input.validation === 'object'
      ? input.validation
      : {
          ok: g4.meta?.validationOk !== false,
          errors: [],
          rejected: Array.isArray(g4.rejectedRelationships)
            ? g4.rejectedRelationships
            : [],
        };

  const ambiguities = Array.isArray(g4.ambiguities)
    ? g4.ambiguities.map((a, i) => ({
        id: a.id || a.requirementId || `amb-${i + 1}`,
        kind: a.kind || 'ambiguity',
        message: a.message || a.reason || 'Ambiguous requirement',
        requirementId: a.requirementId || null,
        cycle: a.cycle || null,
      }))
    : [];

  const conflicts = [];
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  for (const err of errors) {
    if (!err || typeof err !== 'object') continue;
    if (err.code === 'REL_CIRCULAR') {
      conflicts.push({
        id: `conflict-circular-${conflicts.length + 1}`,
        kind: 'circular_relationship',
        code: err.code,
        cycle: err.cycle || null,
        message: 'Circular relationship in requirements graph',
      });
    } else if (
      err.code === 'REL_TARGET_MISSING' ||
      err.code === 'REL_MISSING_ENDPOINT'
    ) {
      conflicts.push({
        id: `conflict-rel-${conflicts.length + 1}`,
        kind: 'invalid_relationship',
        code: err.code,
        message: err.message || err.code,
        from: err.from || null,
        to: err.to || null,
      });
    }
  }

  // Rejected relationships that encode circular / missing targets
  for (const rel of validation.rejected || g4.rejectedRelationships || []) {
    const code = rel.validationError || rel.code;
    if (code === 'REL_CIRCULAR' || code === 'REL_TARGET_MISSING') {
      const already = conflicts.some(
        (c) =>
          c.code === code &&
          String(c.from || '') === String(rel.from || '') &&
          String(c.to || '') === String(rel.to || '')
      );
      if (!already) {
        conflicts.push({
          id: `conflict-rej-${conflicts.length + 1}`,
          kind: code === 'REL_CIRCULAR' ? 'circular_relationship' : 'invalid_relationship',
          code,
          from: rel.from || null,
          to: rel.to || null,
          message: String(code),
        });
      }
    }
  }

  const blocking = [
    ...ambiguities.map((a) => ({ ...a, blockKind: 'ambiguity' })),
    ...conflicts.map((c) => ({ ...c, blockKind: 'conflict' })),
  ];

  const evidenceBound =
    Array.isArray(g4.evidence) && g4.evidence.length > 0
      ? true
      : Array.isArray(g4.relationships) &&
        g4.relationships.every(
          (r) => Array.isArray(r.evidence) && r.evidence.length > 0
        );

  return {
    passed: blocking.length === 0,
    ambiguities,
    conflicts,
    blocking,
    evidenceBound,
    // Explicit: LLM confidence never clears the gate
    confidenceDoesNotClearGate: true,
  };
}

module.exports = {
  evaluateConflictAmbiguityGate,
};
