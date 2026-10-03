/**
 * Resolve runtime snapshot + analysis-freeze pack for a PlanningRun (RULE-DL-01/07).
 * Prefer S2S hydrate when run meta is complete; embedded input.snapshot only as legacy fallback.
 */

const projectClient = require('../clients/project.client');

function hasHydrateMeta(run) {
  const snapshotId = String(run?.snapshotId || '').trim();
  const packId = String(run?.packId || '').trim();
  const organizationId = String(run?.organizationId || '').trim();
  return Boolean(snapshotId && packId && organizationId);
}

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

  const snapshotId = String(run?.snapshotId || '').trim();
  const packId = String(run?.packId || '').trim();
  const organizationId = String(run?.organizationId || '').trim();

  // RULE-DL-01/07: when run meta is present, always S2S hydrate (ignore poisoned embedded stubs)
  if (hasHydrateMeta(run)) {
    const fetchFn = opts.fetchFn || projectClient.fetchAnalysisSnapshotHydrate;
    const data = await fetchFn({ snapshotId, packId, organizationId });
    console.info(
      '[hydrate_snapshot] mode=hydrate snapshotId=%s packId=%s embeddedIgnored=%s',
      snapshotId,
      packId,
      Boolean(embeddedSnapshot)
    );
    return {
      mode: 'hydrate',
      snapshot: data.snapshot,
      pack: data.pack,
      packContentHash: data.packContentHash || null,
      pipelineVersion: data.pipelineVersion ?? null,
    };
  }

  if (embeddedSnapshot && typeof embeddedSnapshot === 'object') {
    console.info(
      '[hydrate_snapshot] mode=embedded_legacy snapshotId=%s packId=%s',
      String(run?.snapshotId || embeddedSnapshot.snapshotId || ''),
      String(run?.packId || '')
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

  const err = new Error(
    'Hydrate requires run.snapshotId, run.packId, run.organizationId'
  );
  err.code = 'HYDRATE_RUN_META_REQUIRED';
  throw err;
}

module.exports = {
  hydrateRunInputFromSnapshot,
  hasHydrateMeta,
};
