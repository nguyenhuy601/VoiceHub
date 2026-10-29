/**
 * Track A / RULE-09 — Snapshot is the immutable boundary before knowledgeCatalog/rag/FR projections.
 * Catalogs and RAG must not run on pack-only / CURRENT live payloads.
 */

const { assertSnapshotBind } = require('./knowledgeSourceDeps');

/**
 * @param {{
 *   snapshotId?: string,
 *   snapshot?: object|null,
 *   phase?: string,
 * }} input
 * @returns {{ snapshotId: string, snapshot: object }}
 */
function assertSnapshotBoundary(input = {}) {
  const { snapshotId } = assertSnapshotBind({
    snapshotId: input.snapshotId,
    runId: input.runId,
  });

  const snapshot = input.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    const err = new Error(
      'Snapshot payload required before knowledgeCatalog/rag/FR (Track A SNAP boundary)'
    );
    err.code = 'SNAPSHOT_PAYLOAD_REQUIRED';
    err.statusCode = 422;
    throw err;
  }

  const embeddedId = String(
    snapshot.snapshotId || snapshot.id || snapshot._id || ''
  ).trim();
  if (embeddedId && embeddedId !== snapshotId) {
    const err = new Error(
      `Snapshot id mismatch: bind=${snapshotId} payload=${embeddedId}`
    );
    err.code = 'SNAPSHOT_ID_MISMATCH';
    err.statusCode = 409;
    throw err;
  }

  const hasDomain =
    snapshot.projected != null ||
    snapshot.employees != null ||
    snapshot.overview != null ||
    snapshot.pack != null ||
    snapshot.functionalRequirements != null ||
    snapshot.knowledgeCatalogs != null ||
    snapshot.skillCatalog != null ||
    (Array.isArray(snapshot.corpus) && snapshot.corpus.length > 0);

  if (!hasDomain) {
    const err = new Error(
      'Snapshot payload is empty — refuse pack-only / live CURRENT projection (Track A)'
    );
    err.code = 'SNAPSHOT_EMPTY';
    err.statusCode = 422;
    throw err;
  }

  // Stamp bind id onto payload for downstream knowledgeCatalog/rag/FR (immutable for this run)
  if (!embeddedId) {
    snapshot.snapshotId = snapshotId;
  }

  return { snapshotId, snapshot, phase: input.phase || null };
}

module.exports = {
  assertSnapshotBoundary,
};
