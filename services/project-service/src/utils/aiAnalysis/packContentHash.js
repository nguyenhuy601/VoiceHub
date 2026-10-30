/**
 * Stable pack content fingerprint for AI Analysis snapshot binding.
 */

const crypto = require('crypto');
const {
  buildRequirementFrSlices,
  buildRequirementFrSlicesForAnalysis,
  buildProjectContextSlice,
} = require('./aiAnalysisFrSlice');

/**
 * Fingerprint NFR rows for pack content hash (RULE-HASH-INCLUDES-NFR-01).
 * @param {object} pack
 * @param {{ maxItems?: number }} [opts]
 */
function buildNfrDigest(pack, { maxItems = 100 } = {}) {
  const rows = Array.isArray(pack?.nonFunctionalRequirements) ? pack.nonFunctionalRequirements : [];
  return rows.slice(0, maxItems).map((r) => ({
    id: String(r.externalId || r.id || r.nfrId || '').trim(),
    req: String(r.requirement || r.description || r.title || r.name || '').slice(0, 200),
    cat: String(r.category || r.type || '').slice(0, 80),
  }));
}

/**
 * Stable hash of pack inputs that affect analysis (FR + NFR + overview).
 * Optional hierarchy includes accepted/pending proposed Requirements for union.
 * @param {object} pack
 * @param {{ hierarchy?: object }} [opts]
 * @returns {string}
 */
function buildPackContentHash(pack, { hierarchy } = {}) {
  const slices = hierarchy
    ? buildRequirementFrSlicesForAnalysis(pack, hierarchy, { maxItems: 200 })
    : buildRequirementFrSlices(pack, { maxItems: 200 });
  const context = buildProjectContextSlice(pack);
  const payload = {
    v: 2,
    context,
    fr: slices.map((s) => ({
      id: s.id,
      m: s.module,
      f: s.feature || '',
      t: s.title,
      d: s.description || '',
      a: s.ac || '',
      src: s.source || '',
    })),
    nfr: buildNfrDigest(pack),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}

module.exports = {
  buildPackContentHash,
  buildNfrDigest,
};
