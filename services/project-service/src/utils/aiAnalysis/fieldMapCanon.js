/**
 * Canonical field names for WHAT/HOW → pack / Task / seed (Gate2 promote map).
 * Dual-write parent for FR: pack uses parentExternalId; HOW keeps parentEpicId.
 */

function textOf(value, max = 4000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

/**
 * Resolve FR parent epic id from proposal/pack row (either name).
 * @returns {string|null|undefined} null = explicit root; undefined = unset
 */
function frParentId(row) {
  if (!row || typeof row !== 'object') return undefined;
  if (row.parentExternalId === null || row.parentEpicId === null) {
    if (row.parentExternalId === null && (row.parentEpicId == null || row.parentEpicId === '')) {
      return null;
    }
    if (row.parentEpicId === null && (row.parentExternalId == null || row.parentExternalId === '')) {
      return null;
    }
  }
  const fromExternal = textOf(row.parentExternalId, 64);
  if (fromExternal) return fromExternal;
  const fromEpic = textOf(row.parentEpicId, 64);
  if (fromEpic) return fromEpic;
  if (row.parentExternalId === null || row.parentEpicId === null) return null;
  return undefined;
}

/**
 * Dual-write parent fields onto a pack FR row (RULE-01).
 * @returns {object} same row mutated / copy fields set
 */
function applyFrParentDualWrite(row, parentId) {
  const out = row && typeof row === 'object' ? row : {};
  if (parentId === undefined) return out;
  if (parentId === null) {
    out.parentExternalId = null;
    out.parentEpicId = null;
    return out;
  }
  const id = textOf(parentId, 64);
  out.parentExternalId = id;
  out.parentEpicId = id;
  return out;
}

/** First FR key from sourceFrIds / sourceFrKey. */
function primaryFrKey(row) {
  if (!row || typeof row !== 'object') return '';
  const direct = textOf(row.sourceFrKey, 120);
  if (direct) return direct;
  const list = Array.isArray(row.sourceFrIds) ? row.sourceFrIds : [];
  for (const id of list) {
    const k = textOf(id, 120);
    if (k) return k;
  }
  return '';
}

/** First UC key from sourceUcKey / sourceUcIds / ucKey. */
function primaryUcKey(row) {
  if (!row || typeof row !== 'object') return '';
  const direct = textOf(row.sourceUcKey || row.ucKey, 120);
  if (direct) return direct;
  const list = Array.isArray(row.sourceUcIds) ? row.sourceUcIds : [];
  for (const id of list) {
    const k = textOf(id, 120);
    if (k) return k;
  }
  return '';
}

/**
 * Build FR → UC map from pack.useCases[].relatedFrIds (first UC wins per FR).
 * @param {Array} useCases
 * @returns {Map<string, string>}
 */
function buildFrToUcMap(useCases = []) {
  const map = new Map();
  for (const uc of Array.isArray(useCases) ? useCases : []) {
    if (!uc || typeof uc !== 'object') continue;
    const ucKey = textOf(uc.externalId || uc.externalKey || uc.id || '', 64);
    if (!ucKey) continue;
    const related = Array.isArray(uc.relatedFrIds)
      ? uc.relatedFrIds
      : String(uc.relatedFr || '')
          .split(/[,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
    for (const fr of related) {
      const frKey = textOf(fr, 64);
      if (frKey && !map.has(frKey)) map.set(frKey, ucKey);
    }
  }
  return map;
}

/** Derive UC key from FR ids using fr→uc map. */
function deriveUcFromFrIds(frIds, frToUcMap) {
  if (!(frToUcMap instanceof Map) || !frToUcMap.size) return '';
  const list = Array.isArray(frIds) ? frIds : frIds ? [frIds] : [];
  for (const fr of list) {
    const k = textOf(fr, 64);
    if (k && frToUcMap.has(k)) return frToUcMap.get(k);
  }
  return '';
}

module.exports = {
  textOf,
  frParentId,
  applyFrParentDualWrite,
  primaryFrKey,
  primaryUcKey,
  buildFrToUcMap,
  deriveUcFromFrIds,
};
