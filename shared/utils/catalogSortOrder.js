/**
 * Mirror of client/src/utils/adminSortOrder.js — used by BE unit tests if needed.
 * Shared package keeps slug utils; sort order steps stay local to admin catalogs.
 */

function sortOrderFromIndex(index) {
  return (Number(index) + 1) * 10;
}

function nextAppendSortOrder(rows) {
  let max = 0;
  for (const row of rows || []) {
    const n = Number(row?.sortOrder);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max + 10 : 10;
}

/**
 * Validate orderedIds is a permutation of existingIds.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateOrderedIdsPermutation(existingIds, orderedIds) {
  const existing = [...new Set((existingIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const ordered = (orderedIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  if (ordered.length !== existing.length) {
    return { ok: false, reason: 'orderedIds length mismatch' };
  }
  if (new Set(ordered).size !== ordered.length) {
    return { ok: false, reason: 'orderedIds has duplicates' };
  }
  const existingSet = new Set(existing);
  for (const id of ordered) {
    if (!existingSet.has(id)) {
      return { ok: false, reason: 'orderedIds contains unknown id' };
    }
  }
  return { ok: true };
}

/**
 * Build full ordered id list after inserting newId at place.
 * @param {string[]} existingOrderedIds
 * @param {string} newId
 * @param {{ place?: 'start'|'end'|'after', afterRoleId?: string }} insert
 * @returns {string[]}
 */
function insertIdAtPlace(existingOrderedIds, newId, insert = {}) {
  const ids = (existingOrderedIds || []).map((id) => String(id)).filter(Boolean);
  const nid = String(newId || '').trim();
  if (!nid) return ids;

  const place = String(insert.place || 'end').toLowerCase();
  if (place === 'start') return [nid, ...ids];

  if (place === 'after') {
    const afterId = String(insert.afterRoleId || '').trim();
    const idx = ids.indexOf(afterId);
    if (idx >= 0) {
      const next = [...ids];
      next.splice(idx + 1, 0, nid);
      return next;
    }
  }

  return [...ids, nid];
}

module.exports = {
  sortOrderFromIndex,
  nextAppendSortOrder,
  validateOrderedIdsPermutation,
  insertIdAtPlace,
};
