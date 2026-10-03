/**
 * PLAN B — Durable Loop1 reuse artifacts (survive parent G15 TERMINAL delete).
 * Stored on pack.aiAnalysis.phaseRuns.phase_what.loop1Reuse (project-service).
 * Not AgentState / parent checkpoint.
 */

const MAX_CONTEXT_DOCS = 40;
const MAX_DOC_TEXT = 2000;
const MAX_FR = 80;

function slimFr(fr) {
  if (!fr || typeof fr !== 'object') return null;
  return {
    id: fr.id || fr.externalId || null,
    externalId: fr.externalId || fr.id || null,
    title: fr.title || fr.name || '',
    description: String(fr.description || '').slice(0, MAX_DOC_TEXT),
    parentId: fr.parentId || null,
    level: fr.level || null,
  };
}

/**
 * Slim understanding prefix enough for hasResumePartial + G4 skip prefix.
 * @param {object|null|undefined} priorPartial
 */
function slimPriorPartial(priorPartial) {
  if (!priorPartial || typeof priorPartial !== 'object') return null;
  const frs = Array.isArray(priorPartial.functionalRequirements)
    ? priorPartial.functionalRequirements.map(slimFr).filter(Boolean).slice(0, MAX_FR)
    : [];
  const projectedFrs = Array.isArray(priorPartial.projected?.functionalRequirements)
    ? priorPartial.projected.functionalRequirements.map(slimFr).filter(Boolean).slice(0, MAX_FR)
    : frs;
  const candidates = Array.isArray(priorPartial.selection?.candidates)
    ? priorPartial.selection.candidates.map(slimFr).filter(Boolean).slice(0, MAX_FR)
    : frs;
  const counts = priorPartial.selection?.counts || {
    candidates: candidates.length,
    clear: candidates.length,
    total: candidates.length,
  };
  return {
    selection: { candidates, counts },
    projected: {
      snapshotId: priorPartial.projected?.snapshotId || null,
      overview: priorPartial.projected?.overview || {},
      functionalRequirements: projectedFrs,
      packId: priorPartial.projected?.packId || null,
    },
    functionalRequirements: frs,
    toolResult:
      priorPartial.toolResult && typeof priorPartial.toolResult === 'object'
        ? { facts: priorPartial.toolResult.facts || {}, ok: true }
        : { facts: {}, ok: true },
    toolEvidence: [],
    constraintFacts: Array.isArray(priorPartial.constraintFacts)
      ? priorPartial.constraintFacts.slice(0, 40)
      : [],
  };
}

/**
 * @param {object|null|undefined} contextPackage
 */
function slimContextPackage(contextPackage) {
  if (!contextPackage || typeof contextPackage !== 'object') return null;
  const docsRaw = Array.isArray(contextPackage.docs)
    ? contextPackage.docs
    : Array.isArray(contextPackage.documents)
      ? contextPackage.documents
      : [];
  const docs = docsRaw.slice(0, MAX_CONTEXT_DOCS).map((d) => ({
    id: d?.id || d?.sourceId || null,
    text: String(d?.text || '').slice(0, MAX_DOC_TEXT),
    docType: d?.docType || null,
    sourceId: d?.sourceId || null,
  }));
  return {
    query: contextPackage.query || 'what_requirements',
    docs,
    snapshotId: contextPackage.snapshotId || null,
  };
}

/**
 * @param {{
 *   snapshotId?: string|null,
 *   sourceRunId?: string|null,
 *   corpusContentHash?: string|null,
 *   contextPackage?: object|null,
 *   priorPartial?: object|null,
 * }} input
 */
function buildLoop1ReuseArtifact(input = {}) {
  const snapshotId = String(input.snapshotId || '').trim();
  const sourceRunId = String(input.sourceRunId || '').trim();
  const corpusContentHash =
    input.corpusContentHash != null ? String(input.corpusContentHash).trim() : '';
  const priorPartial = slimPriorPartial(input.priorPartial);
  const contextPackage = slimContextPackage(input.contextPackage);
  if (!snapshotId || !contextPackage || !priorPartial) return null;
  return {
    snapshotId,
    sourceRunId: sourceRunId || null,
    corpusContentHash: corpusContentHash || null,
    contextPackage,
    priorPartial,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Validate artifact for Loop1 seed (same snapshot).
 * @param {object|null|undefined} artifact
 * @param {string} snapshotId
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
 * Build g4Opts fragment for Loop1 start from durable pack artifact.
 * @param {object|null|undefined} artifact
 * @param {string} snapshotId
 */
function toLoop1G4OptsSeed(artifact, snapshotId) {
  if (!isUsableLoop1Reuse(artifact, snapshotId)) return null;
  return {
    loop1Reenter: true,
    priorPartial: artifact.priorPartial,
    reuseContextPackage: artifact.contextPackage,
    priorCorpusHash: artifact.corpusContentHash || null,
  };
}

module.exports = {
  slimPriorPartial,
  slimContextPackage,
  buildLoop1ReuseArtifact,
  isUsableLoop1Reuse,
  toLoop1G4OptsSeed,
};
