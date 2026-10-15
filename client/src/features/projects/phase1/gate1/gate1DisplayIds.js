/**
 * Gate1/Gate2 review — compact display IDs after reject.
 * Keeps decision keys (logicalId) stable for submit; only UI labels renumber.
 */

const PREFIX_NUM_RE = /^(.+)-(\d+)$/;

function rowLogicalId(row) {
  return String(row?.logicalId || row?.id || '').trim();
}

/**
 * Display IDs with gaps closed when at least one row is rejected.
 * Non-rejected `{PREFIX}-{n}` rows renumber 1..k per prefix (document order).
 * Rejected rows and non-PREFIX ids keep their original logicalId.
 * Without any reject, originals are shown as-is (gaps preserved).
 *
 * @param {object[]} rows
 * @param {Record<string, { action?: string }>} decisions
 * @param {(row: object, index: number) => string} [getRowId]
 * @returns {string[]}
 */
export function resolveGate1DisplayIds(rows = [], decisions = {}, getRowId) {
  const list = Array.isArray(rows) ? rows : [];
  const meta = list.map((row, index) => {
    const decisionId =
      typeof getRowId === 'function'
        ? String(getRowId(row, index) || '').trim()
        : rowLogicalId(row);
    const original = rowLogicalId(row) || '—';
    const action = String(decisions?.[decisionId]?.action || '').toLowerCase();
    return { original, rejected: action === 'reject' };
  });

  if (!meta.some((entry) => entry.rejected)) {
    return meta.map((entry) => entry.original);
  }

  const seqByPrefix = new Map();
  return meta.map((entry) => {
    if (entry.rejected) return entry.original;

    const match = entry.original.match(PREFIX_NUM_RE);
    if (!match) return entry.original;

    const prefix = match[1];
    const next = (seqByPrefix.get(prefix) || 0) + 1;
    seqByPrefix.set(prefix, next);
    return `${prefix}-${next}`;
  });
}
