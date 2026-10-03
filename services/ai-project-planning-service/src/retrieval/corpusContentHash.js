/**
 * Hash for Qdrant corpus skip (RULE-DL-03) — snapshotId + embed version + valid FR set.
 */

const { createHash } = require('node:crypto');

/**
 * @param {{
 *   snapshotId?: string,
 *   embeddingVersion?: string,
 *   frs?: object[],
 * }} opts
 * @returns {string}
 */
function computeCorpusContentHash(opts = {}) {
  const snapshotId = String(opts.snapshotId || '').trim();
  const embeddingVersion = String(opts.embeddingVersion || '').trim();
  const frs = Array.isArray(opts.frs) ? opts.frs : [];
  const lines = frs
    .map((fr) => {
      const id = String(fr?.externalId || fr?.id || '').trim();
      if (!id) return '';
      const title = String(fr?.name || fr?.title || '').trim();
      const description = String(fr?.description || fr?.desc || '').trim();
      const ac = String(fr?.acceptanceCriteria || fr?.ac || '').trim();
      return `${id}\t${title}\t${description}\t${ac}`;
    })
    .filter(Boolean)
    .sort();
  const raw = [snapshotId, embeddingVersion, ...lines].join('\n');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

module.exports = {
  computeCorpusContentHash,
};
