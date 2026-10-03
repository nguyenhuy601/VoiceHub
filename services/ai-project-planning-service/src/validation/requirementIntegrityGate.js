/**
 * Requirement Integrity Gate (RULE-RIG-01…05).
 * Hard-block only machine-certain structural issues:
 *   - data_integrity: incomplete_fields
 *   - relationship_integrity: REL_MISSING_ENDPOINT | REL_TARGET_MISSING | REL_CIRCULAR
 * B2: REL_EVIDENCE_REQUIRED → warnings (not blocking).
 * R1: blockKind data_integrity | relationship_integrity (legacy ambiguity/conflict derived).
 */

const BLOCKING_CAP = 40;
const WARNING_CAP = 40;

const HARD_REL_CODES = new Set([
  'REL_CIRCULAR',
  'REL_TARGET_MISSING',
  'REL_MISSING_ENDPOINT',
]);

/**
 * @param {{
 *   g4Understanding?: object|null,
 *   validation?: object|null,
 * }} input
 */
function evaluateRequirementIntegrityGate(input = {}) {
  const g4 =
    input.g4Understanding && typeof input.g4Understanding === 'object'
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

  const blocking = [];
  const warnings = [];

  const rawAmbiguities = Array.isArray(g4.ambiguities) ? g4.ambiguities : [];
  for (let i = 0; i < rawAmbiguities.length; i += 1) {
    const a = rawAmbiguities[i] || {};
    const kind = String(a.kind || 'ambiguity');
    if (kind === 'incomplete_fields') {
      const missing = Array.isArray(a.missing) ? a.missing.map(String) : [];
      blocking.push({
        id: a.id || a.requirementId || `data-${blocking.length + 1}`,
        blockKind: 'data_integrity',
        kind: 'incomplete_fields',
        message: missing.length
          ? `Missing required fields: ${missing.join(', ')}`
          : 'Missing required fields',
        requirementId: a.requirementId || null,
        missing,
        cycle: a.cycle || null,
      });
      continue;
    }
    if (kind === 'circular_relationship') {
      blocking.push({
        id: a.id || `rel-amb-${blocking.length + 1}`,
        blockKind: 'relationship_integrity',
        kind: 'circular_relationship',
        code: a.code || 'REL_CIRCULAR',
        message: a.message || 'Circular relationship in requirements graph',
        requirementId: a.requirementId || null,
        cycle: a.cycle || null,
        from: a.from || null,
        to: a.to || null,
      });
    }
    // Other ambiguity kinds (vague, semantic, …) are not hard-blocking (RULE-RIG-03).
  }

  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  for (const err of errors) {
    if (!err || typeof err !== 'object') continue;
    const code = String(err.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') {
      warnings.push({
        id: `warn-evidence-${warnings.length + 1}`,
        severity: 'warn',
        kind: 'missing_evidence',
        code,
        message: err.message || code,
        from: err.from || null,
        to: err.to || null,
      });
      continue;
    }
    if (code === 'REL_CIRCULAR') {
      pushRelBlocking(blocking, {
        id: `conflict-circular-${blocking.length + 1}`,
        kind: 'circular_relationship',
        code,
        cycle: err.cycle || null,
        message: 'Circular relationship in requirements graph',
      });
      continue;
    }
    if (code === 'REL_TARGET_MISSING' || code === 'REL_MISSING_ENDPOINT') {
      pushRelBlocking(blocking, {
        id: `conflict-rel-${blocking.length + 1}`,
        kind: 'invalid_relationship',
        code,
        message: err.message || code,
        from: err.from || null,
        to: err.to || null,
      });
    }
  }

  const rejected = validation.rejected || g4.rejectedRelationships || [];
  for (const rel of rejected) {
    const code = String(rel.validationError || rel.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') {
      const already = warnings.some(
        (w) =>
          w.code === code &&
          String(w.from || '') === String(rel.from || '') &&
          String(w.to || '') === String(rel.to || '')
      );
      if (!already) {
        warnings.push({
          id: `warn-evidence-rej-${warnings.length + 1}`,
          severity: 'warn',
          kind: 'missing_evidence',
          code,
          message: String(code),
          from: rel.from || null,
          to: rel.to || null,
        });
      }
      continue;
    }
    if (!HARD_REL_CODES.has(code)) continue;
    const already = blocking.some(
      (c) =>
        c.blockKind === 'relationship_integrity' &&
        c.code === code &&
        String(c.from || '') === String(rel.from || '') &&
        String(c.to || '') === String(rel.to || '')
    );
    if (already) continue;
    pushRelBlocking(blocking, {
      id: `conflict-rej-${blocking.length + 1}`,
      kind: code === 'REL_CIRCULAR' ? 'circular_relationship' : 'invalid_relationship',
      code,
      from: rel.from || null,
      to: rel.to || null,
      message: String(code),
      cycle: rel.cycle || null,
    });
  }

  const cappedBlocking = blocking.slice(0, BLOCKING_CAP);
  const cappedWarnings = warnings.slice(0, WARNING_CAP);

  // Legacy arrays for readers that still expect ambiguities/conflicts
  const ambiguities = cappedBlocking
    .filter((b) => b.blockKind === 'data_integrity')
    .map((b) => ({
      id: b.id,
      kind: b.kind,
      message: b.message,
      requirementId: b.requirementId || null,
      missing: b.missing || [],
      cycle: b.cycle || null,
      blockKind: 'ambiguity',
    }));
  const conflicts = cappedBlocking
    .filter((b) => b.blockKind === 'relationship_integrity')
    .map((b) => ({
      id: b.id,
      kind: b.kind,
      code: b.code || null,
      message: b.message,
      from: b.from || null,
      to: b.to || null,
      cycle: b.cycle || null,
      blockKind: 'conflict',
    }));

  const evidenceBound =
    Array.isArray(g4.evidence) && g4.evidence.length > 0
      ? true
      : Array.isArray(g4.relationships) &&
        g4.relationships.every(
          (r) => Array.isArray(r.evidence) && r.evidence.length > 0
        );

  return {
    passed: cappedBlocking.length === 0,
    blocking: cappedBlocking,
    warnings: cappedWarnings,
    findings: cappedWarnings,
    ambiguities,
    conflicts,
    evidenceBound,
    confidenceDoesNotClearGate: true,
    gateKind: 'requirement_integrity',
  };
}

function pushRelBlocking(blocking, partial) {
  blocking.push({
    ...partial,
    blockKind: 'relationship_integrity',
    from: partial.from || null,
    to: partial.to || null,
    requirementId: partial.requirementId || null,
  });
}

/** Alias — same SoT (legacy export name). */
function evaluateConflictAmbiguityGate(input) {
  return evaluateRequirementIntegrityGate(input);
}

module.exports = {
  evaluateRequirementIntegrityGate,
  evaluateConflictAmbiguityGate,
  HARD_REL_CODES,
};
