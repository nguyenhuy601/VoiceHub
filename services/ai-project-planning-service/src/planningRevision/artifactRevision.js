/**
 * Immutable artifact revision (HOW planning + WHAT requirements.fr).
 * Append-only — never mutate content in place.
 */

const { hashRevisionContent, newRevisionId } = require('./revisionIds');

const ARTIFACT_KINDS = Object.freeze([
  'wbs',
  'dependency',
  'risk',
  'quality',
  'schedule',
  'plan',
  'fr',
]);

const ORIGINS = Object.freeze({
  AI_GENERATED: 'AI_GENERATED',
  HUMAN_EDITED: 'HUMAN_EDITED',
  TOOL_RECALC: 'TOOL_RECALC',
  SYSTEM_RESTORE: 'SYSTEM_RESTORE',
});

/**
 * @param {object} opts
 * @returns {object}
 */
function buildArtifactRevision(opts = {}) {
  const kind = String(opts.kind || 'wbs').toLowerCase();
  if (!ARTIFACT_KINDS.includes(kind)) {
    const err = new Error(`Unsupported artifact kind: ${kind}`);
    err.code = 'ARTIFACT_KIND_INVALID';
    throw err;
  }
  const content = opts.content && typeof opts.content === 'object' ? opts.content : {};
  const revisionId = opts.revisionId || newRevisionId(kind);
  const provenance =
    opts.provenance && typeof opts.provenance === 'object'
      ? opts.provenance
      : {
          origin: ORIGINS.AI_GENERATED,
          runId: opts.runId || null,
          toolName: opts.toolName || null,
          inputRevisionId: opts.inputRevisionId || null,
        };

  return Object.freeze({
    revisionId,
    artifactId: opts.artifactId || `${kind}-01`,
    kind,
    parentRevisionId: opts.parentRevisionId || null,
    origin: opts.origin || provenance.origin || ORIGINS.AI_GENERATED,
    content,
    contentHash: hashRevisionContent(content),
    provenance: Object.freeze({ ...provenance }),
    status: opts.status || 'current',
    createdAt: opts.createdAt || new Date().toISOString(),
    createdBy: opts.createdBy || null,
  });
}

/**
 * Snapshot WBS leaves/nodes for a revision content blob.
 * @param {object} container
 */
function extractWbsContent(container = {}) {
  const planning = container.planning || {};
  const tasks = Array.isArray(planning.tasks) ? planning.tasks : [];
  const wbs = planning.wbs || planning.wbsTree || null;
  return {
    tasks: tasks.map((t) => ({
      id: t?.id || t?.taskId || null,
      parentId: t?.parentId || t?.parentStoryId || null,
      level: t?.level || t?.type || null,
      title: t?.title || t?.name || null,
      description: t?.description || null,
      acceptanceCriteria: t?.acceptanceCriteria || t?.ac || null,
      estimateHours: t?.estimateHours ?? t?.effortHours ?? t?.hours ?? null,
      roleKey: t?.roleKey || t?.suggestedRoleKey || null,
    })),
    meta: wbs?.meta || null,
    taskCount: Number(wbs?.taskCount) || tasks.filter((t) => t?.level === 'task').length,
  };
}

/**
 * Append revision into container.planning.revisions[kind] (immutable list).
 * @param {object} container
 * @param {object} revision
 */
function appendArtifactRevision(container, revision) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const revisions = { ...(planning.revisions || {}) };
  const kind = revision.kind;
  const list = Array.isArray(revisions[kind]) ? [...revisions[kind]] : [];
  // Idempotent: same revisionId → no duplicate
  if (list.some((r) => r && r.revisionId === revision.revisionId)) {
    planning.revisions = revisions;
    base.planning = planning;
    return base;
  }
  const prevCurrent = list.map((r) =>
    r && r.status === 'current' ? { ...r, status: 'superseded' } : r
  );
  prevCurrent.push({ ...revision, status: 'current' });
  revisions[kind] = prevCurrent;
  planning.revisions = revisions;
  planning.currentRevisionIds = {
    ...(planning.currentRevisionIds || {}),
    [kind]: revision.revisionId,
  };
  base.planning = planning;
  return base;
}

function getCurrentRevisionId(container, kind) {
  const fromMap = container?.planning?.currentRevisionIds?.[kind];
  if (fromMap) return String(fromMap);
  const list = container?.planning?.revisions?.[kind];
  if (!Array.isArray(list) || !list.length) return null;
  const current = [...list].reverse().find((r) => r && r.status === 'current');
  return current?.revisionId || list[list.length - 1]?.revisionId || null;
}

function getRevisionById(container, kind, revisionId) {
  const list = container?.planning?.revisions?.[kind];
  if (!Array.isArray(list)) return null;
  return list.find((r) => r && r.revisionId === revisionId) || null;
}

/**
 * Snapshot FR rows for a revision content blob (WHAT).
 * Prefer srsProposal.generated.functionalRequirements; fall back to pack FR list.
 * @param {object} container
 * @param {object|null} [srsProposal]
 */
function extractFrContent(container = {}, srsProposal = null) {
  const proposal =
    (srsProposal && typeof srsProposal === 'object' ? srsProposal : null) ||
    container?.analyses?.srsProposal ||
    container?.srsProposal ||
    null;
  let items = Array.isArray(proposal?.generated?.functionalRequirements?.items)
    ? proposal.generated.functionalRequirements.items
    : [];
  if (!items.length) {
    const packFr = Array.isArray(container?.pack?.functionalRequirements)
      ? container.pack.functionalRequirements
      : Array.isArray(container?.functionalRequirements)
        ? container.functionalRequirements
        : [];
    items = packFr;
  }
  const rows = items.map((row, index) => ({
    id: row?.id || row?.logicalId || row?.frId || row?.externalId || `fr-${index + 1}`,
    title: row?.title || row?.name || null,
    description: row?.description || row?.statement || null,
    acceptanceCriteria: row?.acceptanceCriteria || row?.ac || null,
    priority: row?.priority || null,
    epicId: row?.epicId || row?.epic || null,
  }));
  return {
    items: rows,
    frCount: rows.length,
    proposalVersion: proposal?.proposalVersion ?? null,
    generationId: proposal?.generationId || null,
  };
}

/**
 * Append revision into container.requirements.revisions[kind] (WHAT FR — not planning.*).
 * @param {object} container
 * @param {object} revision
 */
function appendRequirementsArtifactRevision(container, revision) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const requirements = { ...(base.requirements || {}) };
  const revisions = { ...(requirements.revisions || {}) };
  const kind = revision.kind;
  const list = Array.isArray(revisions[kind]) ? [...revisions[kind]] : [];
  if (list.some((r) => r && r.revisionId === revision.revisionId)) {
    requirements.revisions = revisions;
    base.requirements = requirements;
    return base;
  }
  const prevCurrent = list.map((r) =>
    r && r.status === 'current' ? { ...r, status: 'superseded' } : r
  );
  prevCurrent.push({ ...revision, status: 'current' });
  revisions[kind] = prevCurrent;
  requirements.revisions = revisions;
  requirements.currentRevisionIds = {
    ...(requirements.currentRevisionIds || {}),
    [kind]: revision.revisionId,
  };
  base.requirements = requirements;
  return base;
}

function getCurrentRequirementsRevisionId(container, kind) {
  const fromMap = container?.requirements?.currentRevisionIds?.[kind];
  if (fromMap) return String(fromMap);
  const list = container?.requirements?.revisions?.[kind];
  if (!Array.isArray(list) || !list.length) return null;
  const current = [...list].reverse().find((r) => r && r.status === 'current');
  return current?.revisionId || list[list.length - 1]?.revisionId || null;
}

function getRequirementsRevisionById(container, kind, revisionId) {
  const list = container?.requirements?.revisions?.[kind];
  if (!Array.isArray(list)) return null;
  return list.find((r) => r && r.revisionId === revisionId) || null;
}

module.exports = {
  ARTIFACT_KINDS,
  ORIGINS,
  buildArtifactRevision,
  extractWbsContent,
  extractFrContent,
  appendArtifactRevision,
  appendRequirementsArtifactRevision,
  getCurrentRevisionId,
  getCurrentRequirementsRevisionId,
  getRevisionById,
  getRequirementsRevisionById,
};
