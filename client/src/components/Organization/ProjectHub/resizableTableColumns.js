export function clampColWidth(px, minPx = 40, maxPx = Infinity) {
  const min = Number.isFinite(Number(minPx)) ? Math.max(16, Math.round(Number(minPx))) : 40;
  const maxRaw = Number(maxPx);
  const max = Number.isFinite(maxRaw) ? Math.max(min, Math.round(maxRaw)) : Infinity;
  const n = Number(px);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function parseStoredWidths(raw) {
  if (raw == null || raw === '') return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [id, val] of Object.entries(parsed)) {
      const n = Number(val);
      if (id && Number.isFinite(n)) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function widthsFromColumns(columns, stored = {}) {
  const out = {};
  for (const col of columns || []) {
    if (!col?.id) continue;
    const fallback = col.defaultPx ?? col.minPx ?? 80;
    out[col.id] = clampColWidth(stored[col.id] ?? fallback, col.minPx);
  }
  return out;
}

export function buildGridTemplate(columns, widths) {
  return (columns || [])
    .map((col) => `${clampColWidth(widths?.[col.id] ?? col.defaultPx, col.minPx)}px`)
    .join(' ');
}

export function readStoredColumnWidths(storage, key) {
  if (!storage || !key) return {};
  try {
    return parseStoredWidths(storage.getItem(key));
  } catch {
    return {};
  }
}

export function writeStoredColumnWidths(storage, key, widths) {
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify(widths));
  } catch {
    /* quota / private mode */
  }
}
