/**
 * WBS staged checkpoint — pin wbsBaselineRevisionId before downstream HOW tools.
 * Flag AGENT_CORE_HITL_WBS_CHECKPOINT (default off). Revision guards always available.
 */

const {
  buildArtifactRevision,
  extractWbsContent,
  appendArtifactRevision,
  getCurrentRevisionId,
  ORIGINS,
} = require('./artifactRevision');

function truthyEnv(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function isWbsCheckpointEnabled(env = process.env) {
  return truthyEnv(env.AGENT_CORE_HITL_WBS_CHECKPOINT);
}

/**
 * @param {object} container
 */
function getWbsBaselineRevisionId(container) {
  const id = container?.planning?.wbsBaselineRevisionId;
  return id ? String(id) : null;
}

/**
 * True when WBS leaves exist but baseline not pinned (checkpoint required).
 * @param {object} state
 * @param {{ env?: object }} [opts]
 */
function needsWbsConfirm(state, opts = {}) {
  if (!isWbsCheckpointEnabled(opts.env || process.env)) return false;
  const container = state?.container || {};
  if (getWbsBaselineRevisionId(container)) return false;
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const hasLeaves = tasks.some((t) => t && (t.level === 'task' || t.type === 'task'));
  const wbs = container?.planning?.wbs || container?.planning?.wbsTree;
  const count = Number(wbs?.taskCount);
  if (hasLeaves || (Number.isFinite(count) && count > 0)) return true;
  return Boolean(getCurrentRevisionId(container, 'wbs'));
}

/**
 * After WbsTool success — stamp immutable WBS revision (idempotent by contentHash).
 * @param {object} container
 * @param {{ runId?: string, toolName?: string, createdBy?: string|null }} [meta]
 */
function stampWbsRevisionAfterTool(container, meta = {}) {
  const content = extractWbsContent(container);
  const existingId = getCurrentRevisionId(container, 'wbs');
  const {
    hashRevisionContent,
  } = require('./revisionIds');
  const hash = hashRevisionContent(content);
  const list = container?.planning?.revisions?.wbs;
  if (Array.isArray(list) && list.length) {
    const tip = [...list].reverse().find((r) => r?.status === 'current') || list[list.length - 1];
    if (tip?.contentHash === hash) {
      return { container, revision: tip, created: false };
    }
  }
  const revision = buildArtifactRevision({
    kind: 'wbs',
    artifactId: 'wbs-01',
    parentRevisionId: existingId,
    origin: ORIGINS.AI_GENERATED,
    content,
    runId: meta.runId || null,
    toolName: meta.toolName || 'WbsTool',
    createdBy: meta.createdBy || null,
    provenance: {
      origin: ORIGINS.AI_GENERATED,
      runId: meta.runId || null,
      toolName: meta.toolName || 'WbsTool',
      inputRevisionId: null,
      outputValidated: true,
    },
  });
  const next = appendArtifactRevision(container, revision);
  return { container: next, revision, created: true };
}

/**
 * Pin baseline after human confirm (idempotent if already same id).
 * @param {object} container
 * @param {{ revisionId?: string|null, actorUserId?: string|null, requestId?: string|null }} opts
 */
function pinWbsBaseline(container, opts = {}) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const revisionId =
    String(opts.revisionId || '').trim() ||
    getCurrentRevisionId(base, 'wbs') ||
    null;
  if (!revisionId) {
    const err = new Error('Cannot pin WBS baseline — no wbs revision');
    err.code = 'WBS_REVISION_MISSING';
    err.statusCode = 400;
    throw err;
  }
  if (planning.wbsBaselineRevisionId === revisionId) {
    return { container: base, revisionId, duplicated: true };
  }
  planning.wbsBaselineRevisionId = revisionId;
  planning.wbsBaselinePinnedAt = new Date().toISOString();
  planning.wbsBaselinePinnedBy = opts.actorUserId || null;
  if (opts.requestId) {
    planning.wbsBaselinePinRequestId = String(opts.requestId);
  }
  base.planning = planning;
  return { container: base, revisionId, duplicated: false };
}

/**
 * Apply human resume for wbs_confirm (idempotent on requestId).
 * @param {object} state
 * @param {object} humanResume
 */
function applyWbsConfirmResume(state, humanResume = {}) {
  const action = String(humanResume.action || humanResume.decision || '')
    .trim()
    .toLowerCase();
  const kind = String(humanResume.kind || '').trim().toLowerCase();
  if (kind && kind !== 'wbs_confirm') {
    return { state, applied: false };
  }
  if (action && action !== 'confirm' && action !== 'wbs_confirm' && action !== 'approve') {
    return { state, applied: false };
  }
  const requestId = humanResume.requestId || humanResume.idempotencyKey || null;
  const container = state?.container || {};
  if (
    requestId &&
    container?.planning?.wbsBaselinePinRequestId &&
    String(container.planning.wbsBaselinePinRequestId) === String(requestId)
  ) {
    return { state, applied: true, duplicated: true };
  }
  const pinned = pinWbsBaseline(container, {
    revisionId: humanResume.wbsRevisionId || humanResume.revisionId || null,
    actorUserId: humanResume.actorUserId || humanResume.userId || null,
    requestId,
  });
  return {
    state: {
      ...state,
      container: pinned.container,
      history: [`wbs_baseline_pinned:${pinned.revisionId}`],
      humanResume: null,
    },
    applied: true,
    duplicated: pinned.duplicated,
  };
}

module.exports = {
  isWbsCheckpointEnabled,
  getWbsBaselineRevisionId,
  needsWbsConfirm,
  stampWbsRevisionAfterTool,
  pinWbsBaseline,
  applyWbsConfirmResume,
};
