/**
 * Display order helpers for admin role catalogs (Org / Project).
 */

/** @param {number} index 0-based */
export function sortOrderFromIndex(index) {
  return (Number(index) + 1) * 10;
}

/** @param {number} length */
export function sortOrdersFromIndex(length) {
  const n = Math.max(0, Number(length) || 0);
  return Array.from({ length: n }, (_, i) => sortOrderFromIndex(i));
}

/**
 * Move id from oldIndex to newIndex in an ordered id list.
 * @param {string[]} ids
 * @param {number} oldIndex
 * @param {number} newIndex
 * @returns {string[]}
 */
export function reorderIds(ids, oldIndex, newIndex) {
  const list = Array.isArray(ids) ? [...ids] : [];
  if (oldIndex < 0 || newIndex < 0 || oldIndex >= list.length || newIndex >= list.length) {
    return list;
  }
  const [item] = list.splice(oldIndex, 1);
  list.splice(newIndex, 0, item);
  return list;
}

/**
 * Reorder items by id using a new orderedIds permutation.
 * @template {{ _id?: string, id?: string }} T
 * @param {T[]} items
 * @param {string[]} orderedIds
 * @returns {T[]}
 */
export function reorderItemsByIds(items, orderedIds) {
  const byId = new Map(
    (items || []).map((row) => [String(row._id || row.id), row])
  );
  const next = [];
  for (const id of orderedIds || []) {
    const row = byId.get(String(id));
    if (row) next.push(row);
  }
  return next;
}

/**
 * Next sortOrder when appending a new catalog row.
 * @param {Array<{ sortOrder?: number }>} rows
 */
export function nextAppendSortOrder(rows) {
  let max = 0;
  for (const row of rows || []) {
    const n = Number(row?.sortOrder);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max + 10 : 10;
}
