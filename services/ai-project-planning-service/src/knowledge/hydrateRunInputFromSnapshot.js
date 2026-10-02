/**
 * Resolve runtime snapshot + analysis-freeze pack for a PlanningRun (RULE-DL-01/07).
 * New runs: S2S hydrate. Legacy: embedded input.snapshot only.
 */

const projectClient = require('../clients/project.client');

/**
 * @param {object} run — PlanningRun lean
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<{
 *   mode: 'hydrate'|'embedded_legacy',
 *   snapshot: object,
 *   pack: object,
 *   packContentHash?: string|null,
 *   pipelineVersion?: number|null,
 * }>}
 */
async function hydrateRunInputFromSnapshot(run, opts = {}) {
  const input = run?.input && typeof run.input === 'object' ? run.input : {};
  const embeddedSnapshot = input.snapshot || input.snapshotPayload || null;
  const embeddedPack = input.pack || null;

  if (embeddedSnapshot && typeof embeddedSnapshot === 'object') {
    console.info(
      '[hydrate_snapshot] mode=embedded_legacy snapshotId=%s packId=%s',
      String(run.snapshotId || embeddedSnapshot.snapshotId || ''),
      String(run.packId || '')
    );
    return {
      mode: 'embedded_legacy',
      snapshot: embeddedSnapshot,
      pack:
        embeddedPack && typeof embeddedPack === 'object'
          ? embeddedPack
          : {},
      packContentHash: input.packContentHash || null,
      pipelineVersion: input.pipelineVersion ?? null,
    };
  }

  const snapshotId = String(run.snapshotId || '').trim();
  const packId = String(run.packId || '').trim();
  const organizationId = String(run.organizationId || '').trim();
  if (!snapshotId || !packId || !organizationId) {
    const err = new Error(
      'Hydrate requires run.snapshotId, run.packId, run.organizationId'
    );
    err.code = 'HYDRATE_RUN_META_REQUIRED';
    throw err;
  }

  const fetchFn = opts.fetchFn || projectClient.fetchAnalysisSnapshotHydrate;
  const data = await fetchFn({ snapshotId, packId, organizationId });
  console.info(
    '[hydrate_snapshot] mode=hydrate snapshotId=%s packId=%s',
    snapshotId,
    packId
  );
  return {
    mode: 'hydrate',
    snapshot: data.snapshot,
    pack: data.pack,
    packContentHash: data.packContentHash || null,
    pipelineVersion: data.pipelineVersion ?? null,
  };
}

module.exports = {
  hydrateRunInputFromSnapshot,
};
