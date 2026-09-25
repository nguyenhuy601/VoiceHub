/**
 * Client-side sort + pagination for Phase 1 artifact tables (no API change).
 */

export const PHASE1_TABLE_PAGE_SIZE = 10;

/**
 * @param {unknown} value
 * @returns {string}
 */
export function phase1SortKey(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(', ')
      .toLowerCase();
  }
  return String(value).trim().toLowerCase();
}

/**
 * @template T
 * @param {T[]} rows
 * @param {{
 *   sortId: string | null,
 *   sortDir: 'asc' | 'desc',
 *   getValue: (row: T, colId: string) => unknown,
 * }} opts
 * @returns {T[]}
 */
export function sortPhase1Rows(rows, { sortId, sortDir, getValue }) {
  if (!sortId || !Array.isArray(rows) || rows.length < 2) return rows || [];
  const dir = sortDir === 'desc' ? -1 : 1;
  const copy = [...rows];
  copy.sort((a, b) => {
    const ka = phase1SortKey(getValue(a, sortId));
    const kb = phase1SortKey(getValue(b, sortId));
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    return 0;
  });
  return copy;
}

/**
 * @template T
 * @param {T[]} rows
 * @param {{ page: number, pageSize?: number }} opts
 * @returns {{ pageRows: T[], page: number, pageCount: number, total: number, pageSize: number }}
 */
export function paginatePhase1Rows(rows, { page, pageSize = PHASE1_TABLE_PAGE_SIZE }) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(pageSize) || PHASE1_TABLE_PAGE_SIZE);
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / size) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (safePage - 1) * size;
  return {
    pageRows: list.slice(start, start + size),
    page: safePage,
    pageCount,
    total,
    pageSize: size,
  };
}

/**
 * Split comma/semicolon/pipe lists into pill labels (CR-001, FR-02, …).
 * @param {unknown} value
 * @returns {string[]}
 */
export function splitPhase1KeyList(value) {
  const raw = Array.isArray(value)
    ? value.map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')
    : String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
