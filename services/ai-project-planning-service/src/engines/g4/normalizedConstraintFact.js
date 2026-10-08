/**
 * NormalizedConstraintFact contract (W1).
 * Inventory: only constraintTypes with structured representation may be compared.
 * W1 supported compare type: actor_policy — only when facts are supplied (not invented from prose keywords).
 * Emitter from raw signals does NOT invent actor_policy (no English keyword parser).
 */

const SUPPORTED_CONSTRAINT_TYPES = Object.freeze(['actor_policy']);

/**
 * @param {string|null|undefined} object
 * @param {string|null|undefined} action
 * @param {string|null|undefined} field
 */
function buildTargetKey(object, action, field) {
  const norm = (v) =>
    String(v || '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase() || '_';
  return `${norm(object)}.${norm(action)}.${norm(field)}`;
}

/**
 * @param {object} raw
 * @returns {object|null}
 */
function normalizeConstraintFact(raw = {}) {
  const frId = String(raw.frId || '').trim();
  const constraintType = String(raw.constraintType || '').trim();
  if (!frId || !constraintType) return null;
  if (!SUPPORTED_CONSTRAINT_TYPES.includes(constraintType)) return null;

  const targetKey =
    raw.targetKey ||
    buildTargetKey(raw.target?.object, raw.target?.action, raw.target?.field);
  if (!targetKey || targetKey === '_._._') return null;

  const sourceRef =
    raw.sourceRef && typeof raw.sourceRef === 'object'
      ? {
          kind: String(raw.sourceRef.kind || 'signal'),
          path: raw.sourceRef.path != null ? String(raw.sourceRef.path) : undefined,
          documentId:
            raw.sourceRef.documentId != null ? String(raw.sourceRef.documentId) : undefined,
          spanId: raw.sourceRef.spanId != null ? String(raw.sourceRef.spanId) : undefined,
          rowId: raw.sourceRef.rowId != null ? String(raw.sourceRef.rowId) : undefined,
        }
      : { kind: 'signal' };

  return {
    frId,
    targetKey: String(targetKey),
    constraintType,
    constraintValue: raw.constraintValue,
    sourceRef,
  };
}

/**
 * W1: signals alone do not yield actor_policy / allowed_values / state_transition.
 * Returns [] — Case B / unstructured path.
 * Inject NormalizedConstraintFact[] in tests or future structured workbook mapping.
 */
function emitConstraintFactsFromSignals(_signals = []) {
  return [];
}

module.exports = {
  SUPPORTED_CONSTRAINT_TYPES,
  buildTargetKey,
  normalizeConstraintFact,
  emitConstraintFactsFromSignals,
};
