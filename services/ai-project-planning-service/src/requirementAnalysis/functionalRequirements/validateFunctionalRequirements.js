/**
 * Validate FR semantic output before proposal fragment.
 */

/**
 * @param {{ g4Understanding?: object, validation?: object }} input
 * @returns {{ ok: boolean, errors: string[], warnings: string[], accepted: object, rejected: object[] }}
 */
function validateFunctionalRequirements(input = {}) {
  const g4 = input.g4Understanding && typeof input.g4Understanding === 'object'
    ? input.g4Understanding
    : {};
  const validation = input.validation && typeof input.validation === 'object'
    ? input.validation
    : {};
  const errors = [];
  const warnings = [];

  const requirements = Array.isArray(g4.requirements) ? g4.requirements : [];
  if (requirements.length === 0) {
    errors.push('FR_EMPTY');
  }
  for (const r of requirements) {
    if (!r?.id && !r?.frId) errors.push('FR_MISSING_ID');
  }

  const relOk = validation.ok !== false;
  if (!relOk) {
    warnings.push('RELATIONSHIP_VALIDATION_PARTIAL');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    accepted: {
      requirements,
      relationships: Array.isArray(validation.accepted)
        ? validation.accepted
        : Array.isArray(g4.relationships)
          ? g4.relationships
          : [],
      ambiguities: Array.isArray(g4.ambiguities) ? g4.ambiguities : [],
      assumptions: Array.isArray(g4.assumptions) ? g4.assumptions : [],
      evidence: g4.evidence || null,
      semanticItems: Array.isArray(g4.semanticItems) ? g4.semanticItems : [],
      conflicts: Array.isArray(g4.conflicts) ? g4.conflicts : [],
      facts: g4.facts || {},
      signalsMeta: g4.signalsMeta || null,
      meta: g4.meta || {},
    },
    rejected: Array.isArray(validation.rejected)
      ? validation.rejected
      : Array.isArray(g4.rejectedRelationships)
        ? g4.rejectedRelationships
        : [],
  };
}

module.exports = { validateFunctionalRequirements };
