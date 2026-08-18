/** Catalog priority theo dự án / workflow template — default low/medium/high/urgent. */

const DEFAULT_PRIORITY_ITEMS = Object.freeze([
  { key: 'low', label: 'Low', order: 1 },
  { key: 'medium', label: 'Medium', order: 2 },
  { key: 'high', label: 'High', order: 3 },
  { key: 'urgent', label: 'Urgent', order: 4 },
]);

function slugPriorityKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

function asItemList(raw) {
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw)) return raw;
  return [];
}

function normalizePriorityConfig(raw) {
  const seen = new Set();
  const items = [];
  for (const row of asItemList(raw)) {
    const key = slugPriorityKey(row?.key || row?.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      label: String(row?.label || key).trim().slice(0, 64) || key,
      order: Number.isFinite(Number(row?.order)) ? Number(row.order) : items.length + 1,
    });
  }
  if (!items.length) {
    return { items: DEFAULT_PRIORITY_ITEMS.map((x) => ({ ...x })) };
  }
  return { items };
}

function serializePriorityConfig(raw) {
  return normalizePriorityConfig(raw);
}

function priorityKeysOf(raw) {
  return normalizePriorityConfig(raw).items.map((i) => i.key);
}

function isAllowedPriority(value, raw) {
  const v = slugPriorityKey(value);
  if (!v) return false;
  return priorityKeysOf(raw).includes(v);
}

module.exports = {
  DEFAULT_PRIORITY_ITEMS,
  slugPriorityKey,
  normalizePriorityConfig,
  serializePriorityConfig,
  priorityKeysOf,
  isAllowedPriority,
};
