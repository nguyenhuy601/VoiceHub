/**
 * PLAN B — Loop1 durable reuse on pack.aiAnalysis.phaseRuns.phase_what.loop1Reuse.
 * Mirror of APS knowledge/loop1ReuseArtifact (PS cannot import APS).
 */

function isUsableLoop1Reuse(artifact, snapshotId) {
  if (!artifact || typeof artifact !== 'object') return false;
  const snap = String(snapshotId || '').trim();
  if (!snap || String(artifact.snapshotId || '').trim() !== snap) return false;
  const pp = artifact.priorPartial;
  const hasPartial = Boolean(
    pp && typeof pp === 'object' && pp.selection && pp.projected
  );
  const cp = artifact.contextPackage;
  const hasCtx = Boolean(cp && typeof cp === 'object');
  return hasPartial && hasCtx;
}

/**
 * Persist callback artifact onto phase_what (same snapshot only).
 * @param {object} container
 * @param {object|null|undefined} artifact
 * @param {string} snapshotId
 */
function attachLoop1ReuseToContainer(container, artifact, snapshotId) {
  if (!container || typeof container !== 'object') return container;
  if (!isUsableLoop1Reuse(artifact, snapshotId)) return container;
  const next = container;
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  const prev = next.phaseRuns.phase_what || {};
  next.phaseRuns.phase_what = {
    ...prev,
    loop1Reuse: {
      snapshotId: String(artifact.snapshotId),
      sourceRunId: artifact.sourceRunId || null,
      corpusContentHash: artifact.corpusContentHash || null,
      contextPackage: artifact.contextPackage,
      priorPartial: artifact.priorPartial,
      savedAt: artifact.savedAt || new Date().toISOString(),
    },
  };
  return next;
}

/**
 * @param {object|null|undefined} packAiAnalysis
 * @param {string} snapshotId
 */
function readLoop1ReuseFromPack(packAiAnalysis, snapshotId) {
  const artifact = packAiAnalysis?.phaseRuns?.phase_what?.loop1Reuse || null;
  return isUsableLoop1Reuse(artifact, snapshotId) ? artifact : null;
}

/**
 * @param {object|null|undefined} artifact
 */
function toLoop1G4OptsSeed(artifact) {
  if (!artifact) return null;
  return {
    loop1Reenter: true,
    priorPartial: artifact.priorPartial,
    reuseContextPackage: artifact.contextPackage,
    priorCorpusHash: artifact.corpusContentHash || null,
  };
}

module.exports = {
  isUsableLoop1Reuse,
  attachLoop1ReuseToContainer,
  readLoop1ReuseFromPack,
  toLoop1G4OptsSeed,
};
