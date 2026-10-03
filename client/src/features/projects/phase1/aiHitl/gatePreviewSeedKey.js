/**
 * Stable seed for Data Gate pagination reset — ignore new object refs with same totals.
 * @param {object|null|undefined} preview
 * @returns {string}
 */
export function gatePreviewSeedKey(preview) {
  if (!preview || typeof preview !== 'object') return '';
  return [
    Number(preview.rowTotal) || 0,
    Number(preview.frCount) || 0,
    Number(preview.candidateCount) || 0,
    Number(preview.duplicateCount) || 0,
    Number(preview.skippedCount) || 0,
  ].join('|');
}

export default gatePreviewSeedKey;
