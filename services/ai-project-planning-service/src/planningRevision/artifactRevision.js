/**
 * Immutable HOW artifact revision (WBS / dependency / risk / quality / schedule).
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

module.exports = {
  ARTIFACT_KINDS,
  ORIGINS,
  buildArtifactRevision,
  extractWbsContent,
  appendArtifactRevision,
  getCurrentRevisionId,
  getRevisionById,
};
