/**
 * Evidence / sourceRefs contract — direct Raw + derived lineage.
 */

/**
 * @param {unknown} ref
 * @returns {object|null}
 */
function normalizeSourceRef(ref) {
  if (!ref || typeof ref !== 'object') {
    if (typeof ref === 'string' && ref.trim()) {
      return { sourceId: 'LOGICAL', logicalId: ref.trim() };
    }
    return null;
  }
  const documentId = ref.documentId || ref.sourceId || ref.docId || null;
  const sheet = ref.sheet != null ? String(ref.sheet) : null;
  const row = ref.row != null ? Number(ref.row) : ref.rowId != null ? ref.rowId : null;
  const span = ref.span || ref.spanId || ref.text || null;
  const logicalId = ref.logicalId || null;
  return {
    sourceId: documentId ? String(documentId) : logicalId ? 'LOGICAL' : 'RAW',
    documentId: documentId ? String(documentId) : null,
    sheet,
    row,
    span: span != null ? String(span) : null,
    logicalId: logicalId ? String(logicalId) : null,
    relationType: ref.relationType || 'supports',
  };
}

/**
 * @param {unknown[]} refs
 * @returns {object[]}
 */
function normalizeSourceRefs(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.map(normalizeSourceRef).filter(Boolean);
}

/**
 * Collect Raw lineage from item + upstream FR map (RULE-DERIVED-LINEAGE-01).
 * @param {object} item
 * @param {Map<string, object>|Record<string, object>} [upstreamById]
 */
function resolveDerivedLineage(item, upstreamById = {}) {
  const get =
    upstreamById instanceof Map
      ? (id) => upstreamById.get(id)
      : (id) => upstreamById[id];

  const direct = normalizeSourceRefs(item?.sourceRefs || []);
  const derivedFrom = Array.isArray(item?.provenance?.derivedFrom)
    ? item.provenance.derivedFrom.map(String)
    : [];

  const upstreamRefs = [];
  for (const id of derivedFrom) {
    const up = get(id);
    if (up) {
      upstreamRefs.push(...normalizeSourceRefs(up.sourceRefs || []));
    } else {
      upstreamRefs.push({ sourceId: 'LOGICAL', logicalId: id, relationType: 'derived_from' });
    }
  }

  return { direct, upstream: upstreamRefs, all: [...direct, ...upstreamRefs] };
}

function hasEvidenceOrDerivation(item) {
  const refs = Array.isArray(item?.sourceRefs) ? item.sourceRefs : [];
  const derived = Array.isArray(item?.provenance?.derivedFrom)
    ? item.provenance.derivedFrom
    : [];
  return refs.length > 0 || derived.length > 0;
}

module.exports = {
  normalizeSourceRef,
  normalizeSourceRefs,
  resolveDerivedLineage,
  hasEvidenceOrDerivation,
};
