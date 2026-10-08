/**
 * ProposalItem contract — Analysis Proposal items (not SRS).
 */

const ORIGIN_TYPES = Object.freeze([
  'EXTRACTED',
  'NORMALIZED',
  'HEURISTIC',
  'DERIVED',
  'AI_SYNTHESIS',
]);

const ITEM_STATUSES = Object.freeze([
  'EXTRACTED',
  'PROPOSED',
  'ACCEPTED',
  'NEEDS_CONFIRMATION',
  'REJECTED',
]);

/**
 * Normalize origin to uppercase enum; map legacy strings.
 * @param {unknown} raw
 * @param {{ derived?: boolean, heuristic?: boolean }} [hints]
 */
function normalizeOrigin(raw, hints = {}) {
  if (hints.derived) return 'DERIVED';
  if (hints.heuristic) return 'HEURISTIC';
  const s = String(raw || '').trim().toUpperCase();
  if (ORIGIN_TYPES.includes(s)) return s;
  if (s === 'FR_EXTRACT' || s === 'EXTRACT' || s === 'SOURCE' || s === 'BUSINESS_RULE') {
    if (s === 'BUSINESS_RULE') return 'DERIVED';
    return 'EXTRACTED';
  }
  if (!s) return 'EXTRACTED';
  return 'EXTRACTED';
}

/**
 * @param {object} item
 * @param {{ index?: number, engineId?: string, section?: string, defaultPrefix?: string }} [opts]
 */
function normalizeProposalItem(item, opts = {}) {
  const raw = item && typeof item === 'object' ? item : {};
  const index = opts.index ?? 0;
  const prefix = opts.defaultPrefix || 'ITEM';
  const logicalId = String(
    raw.logicalId || raw.id || raw.frId || `${prefix}-${index + 1}`
  ).trim();

  const derivedFromBr = Boolean(raw.derivedFromBr || raw.sourceKind === 'business_rule');
  const origin = normalizeOrigin(raw.origin?.type || raw.origin, {
    derived: derivedFromBr || String(raw.origin?.type || '').toUpperCase() === 'DERIVED',
    heuristic: String(raw.provenance?.type || '').toUpperCase() === 'HEURISTIC',
  });

  let status = String(raw.status || 'EXTRACTED').toUpperCase();
  if (derivedFromBr || origin === 'DERIVED') {
    status = 'PROPOSED';
  }
  if (!ITEM_STATUSES.includes(status)) status = 'EXTRACTED';

  const provenance =
    raw.provenance && typeof raw.provenance === 'object'
      ? {
          type: String(raw.provenance.type || origin).toUpperCase(),
          derivedFrom: Array.isArray(raw.provenance.derivedFrom)
            ? raw.provenance.derivedFrom.map(String)
            : derivedFromBr && raw.derivedFromBr
              ? [String(raw.derivedFromBr)]
              : [],
          rule: raw.provenance.rule || null,
          producer: raw.provenance.producer
            ? String(raw.provenance.producer)
            : origin === 'AI_SYNTHESIS'
              ? 'semantic_runtime'
              : origin === 'HEURISTIC'
                ? 'heuristic_rule'
                : 'deterministic',
        }
      : derivedFromBr
        ? {
            type: 'DERIVED',
            derivedFrom: [String(raw.derivedFromBr || raw.id || '')].filter(Boolean),
            rule: 'BR_TO_FR',
            producer: 'deterministic',
          }
        : {
            type: origin,
            derivedFrom: [],
            rule: null,
            producer:
              origin === 'AI_SYNTHESIS'
                ? 'semantic_runtime'
                : origin === 'HEURISTIC'
                  ? 'heuristic_rule'
                  : 'deterministic',
          };

  const sourceRefs = Array.isArray(raw.sourceRefs)
    ? raw.sourceRefs
    : Array.isArray(raw.evidence)
      ? raw.evidence
      : [];

  return {
    ...raw,
    logicalId,
    id: raw.id || logicalId,
    title: raw.title || raw.name || logicalId,
    description: raw.description || raw.text || '',
    status,
    origin: {
      type: origin,
      engine: opts.engineId || raw.origin?.engine || null,
      section: opts.section || raw.origin?.section || null,
    },
    provenance,
    sourceRefs,
  };
}

/**
 * RULE-BR-FR-01: derived-from-BR must be PROPOSED; reject Accepted/Approved.
 * @param {object} item
 */
function assertBrDerivedFrInvariant(item) {
  const rawStatus = String(item?.status || '').toUpperCase();
  const isDerived =
    Boolean(item?.derivedFromBr) ||
    item?.sourceKind === 'business_rule' ||
    item?.origin === 'br_to_fr' ||
    String(item?.origin?.type || '').toUpperCase() === 'DERIVED' ||
    String(item?.provenance?.type || '').toUpperCase() === 'DERIVED';

  if (isDerived && (rawStatus === 'ACCEPTED' || rawStatus === 'APPROVED')) {
    const err = new Error('BR-derived FR must remain PROPOSED (RULE-BR-FR-01)');
    err.code = 'BR_FR_INVARIANT';
    throw err;
  }

  const normalized = normalizeProposalItem(item);
  if (!isDerived) return normalized;
  normalized.status = 'PROPOSED';
  if (normalized.origin) normalized.origin.type = 'DERIVED';
  return normalized;
}

function isProposalItemShape(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(item.logicalId) && Array.isArray(item.sourceRefs) && item.origin != null;
}

module.exports = {
  ORIGIN_TYPES,
  ITEM_STATUSES,
  normalizeOrigin,
  normalizeProposalItem,
  assertBrDerivedFrInvariant,
  isProposalItemShape,
};
