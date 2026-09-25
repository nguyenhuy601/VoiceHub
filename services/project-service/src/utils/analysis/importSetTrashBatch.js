/**
 * Pure helpers — Import Set cascade trash batch id + restore filters (RULE-03/04).
 */

const DELETED_REASON_SET_CASCADE = 'set_cascade';

/**
 * @param {string} setId
 * @param {number} [nowMs]
 */
function buildDeletedBatchId(setId, nowMs = Date.now()) {
  return `${String(setId)}:${nowMs}`;
}

/**
 * Parse batch timestamp from id (best-effort).
 * @param {string | null | undefined} batchId
 */
function parseBatchTimestampMs(batchId) {
  const raw = String(batchId || '');
  const idx = raw.lastIndexOf(':');
  if (idx < 0) return null;
  const n = Number(raw.slice(idx + 1));
  return Number.isFinite(n) ? n : null;
}

/**
 * Mongo filter: restore only members trashed in this cascade batch.
 * Docs with other batch or manual delete stay inactive.
 * @param {string} importSetId
 * @param {string | null | undefined} batchId
 */
function buildMemberRestoreFilter(importSetId, batchId) {
  const setId = importSetId;
  if (!batchId) {
    return {
      importSetId: setId,
      deletedReason: DELETED_REASON_SET_CASCADE,
      deletedBatchId: { $in: [null, ''] },
    };
  }
  return {
    importSetId: setId,
    deletedReason: DELETED_REASON_SET_CASCADE,
    deletedBatchId: String(batchId),
  };
}

/**
 * Filter for cascade trash — only currently active members.
 * @param {string} importSetId
 */
function buildMemberTrashFilter(importSetId) {
  return { importSetId, isActive: true };
}

module.exports = {
  DELETED_REASON_SET_CASCADE,
  buildDeletedBatchId,
  parseBatchTimestampMs,
  buildMemberRestoreFilter,
  buildMemberTrashFilter,
};
