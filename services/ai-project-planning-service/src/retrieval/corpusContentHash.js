/**
 * Hash for Qdrant corpus skip (RULE-DL-03) — snapshotId + embed version + FR + HOW slices.
 */

const { createHash } = require('node:crypto');

const HASH_DOC_TYPES = Object.freeze([
  'srs_canonical',
  'srs_nfr',
  'srs_uc',
  'srs_ac',
  'srs_technology',
]);

/**
 * @param {{
 *   snapshotId?: string,
 *   embeddingVersion?: string,
 *   frs?: object[],
 *   docs?: object[],
 * }} opts
 * @returns {string}
 */
function computeCorpusContentHash(opts = {}) {
  const snapshotId = String(opts.snapshotId || '').trim();
  const embeddingVersion = String(opts.embeddingVersion || '').trim();
  const frs = Array.isArray(opts.frs) ? opts.frs : [];
  const frLines = frs
    .map((fr) => {
      const id = String(fr?.externalId || fr?.id || '').trim();
      if (!id) return '';
      const title = String(fr?.name || fr?.title || '').trim();
      const description = String(fr?.description || fr?.desc || '').trim();
      const ac = String(fr?.acceptanceCriteria || fr?.ac || '').trim();
      return `fr\t${id}\t${title}\t${description}\t${ac}`;
    })
    .filter(Boolean);

  const docs = Array.isArray(opts.docs) ? opts.docs : [];
  const docLines = docs
    .filter((d) => HASH_DOC_TYPES.includes(String(d?.docType || '')))
    .map((d) => {
      const type = String(d.docType || '');
      const id = String(d.sourceId || d.id || '').trim();
      if (!id) return '';
      const text = String(d.text || '').trim().slice(0, 240);
      return `${type}\t${id}\t${text}`;
    })
    .filter(Boolean);

  // Prefer full docs (incl. NFR/UC/AC/tech); fall back to FR-only for legacy callers
  const lines = (docLines.length ? docLines : frLines).sort();
  const raw = [snapshotId, embeddingVersion, ...lines].join('\n');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

module.exports = {
  computeCorpusContentHash,
  HASH_DOC_TYPES,
};
