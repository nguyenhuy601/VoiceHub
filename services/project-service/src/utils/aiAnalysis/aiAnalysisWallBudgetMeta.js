/**
 * Meta helpers when an AI Analysis chunk loop stops for wall_budget.
 */

/**
 * Sum input counts for chunks from `fromIndex` inclusive to the end.
 * @param {unknown[]} chunks
 * @param {number} fromIndex
 * @param {(chunk: unknown) => number} countInputs
 * @returns {number}
 */
function countRemainingChunkInputs(chunks, fromIndex, countInputs) {
  const list = Array.isArray(chunks) ? chunks : [];
  const start = Math.max(0, Math.floor(Number(fromIndex)) || 0);
  if (typeof countInputs !== 'function' || start >= list.length) return 0;

  let total = 0;
  for (let i = start; i < list.length; i += 1) {
    const n = Number(countInputs(list[i]));
    if (Number.isFinite(n) && n > 0) total += Math.floor(n);
  }
  return total;
}

/**
 * @param {{
 *   chunks: unknown[],
 *   fromIndex: number,
 *   countInputs: (chunk: unknown) => number,
 *   kind: 'parent' | 'fr' | 'capability' | 'recommendation',
 * }} opts
 * @returns {{ wallBudgetSkippedInputCount: number, wallBudgetSkippedInputKind: string }}
 */
function buildWallBudgetSkipMeta({ chunks, fromIndex, countInputs, kind }) {
  const wallBudgetSkippedInputCount = countRemainingChunkInputs(chunks, fromIndex, countInputs);
  return {
    wallBudgetSkippedInputCount,
    wallBudgetSkippedInputKind: String(kind || 'fr'),
  };
}

module.exports = {
  countRemainingChunkInputs,
  buildWallBudgetSkipMeta,
};
