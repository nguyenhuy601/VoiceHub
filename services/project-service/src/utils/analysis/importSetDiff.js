/**
 * Pure diff helpers for rollback preview (RULE-09).
 */

const MANUAL_SOURCE = 'seed_from_pack';

/**
 * @param {{ source?: string, contentHash?: string, seedContentHash?: string }} artifact
 */
function isManualEditedArtifact(artifact) {
  const source = String(artifact?.source || '').trim();
  if (source && source !== MANUAL_SOURCE) return true;
  const hash = String(artifact?.contentHash || '').trim();
  const seedHash = String(artifact?.seedContentHash || '').trim();
  if (hash && seedHash && hash !== seedHash) return true;
  return false;
}

/**
 * @param {Array<{ id: string, kind: string, externalKey: string, source?: string, contentHash?: string, seedContentHash?: string }>} activeArtifacts
 * @param {number} [limit]
 */
function pickManualEditedForDiff(activeArtifacts, limit = 200) {
  const rows = [];
  let truncated = false;
  for (const a of activeArtifacts || []) {
    if (!isManualEditedArtifact(a)) continue;
    if (rows.length >= limit) {
      truncated = true;
      break;
    }
    rows.push({
      id: a.id,
      kind: a.kind,
      externalKey: a.externalKey,
      reason: a.source && a.source !== MANUAL_SOURCE ? 'manual_source' : 'content_hash_changed',
    });
  }
  return { manualEditedArtifacts: rows, truncated };
}

module.exports = {
  isManualEditedArtifact,
  pickManualEditedForDiff,
  MANUAL_SOURCE,
};
