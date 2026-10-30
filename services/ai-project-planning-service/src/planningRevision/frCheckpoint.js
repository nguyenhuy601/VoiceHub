/**
 * FR staged checkpoint (WHAT) — always-on.
 * Pin requirements.frBaselineRevisionId before UC/Data dependents.
 * No product env flag (unlike WBS AGENT_CORE_HITL_WBS_CHECKPOINT).
 */

const {
  buildArtifactRevision,
  extractFrContent,
  appendRequirementsArtifactRevision,
  getCurrentRequirementsRevisionId,
  ORIGINS,
} = require('./artifactRevision');

/**
 * @param {object} container
 */
function getFrBaselineRevisionId(container) {
  const id = container?.requirements?.frBaselineRevisionId;
  return id ? String(id) : null;
}

/**
 * True when FR content/revision exists but baseline not pinned.
 * @param {object} state — LangGraph state or { container, srsProposal }
 */
function needsFrConfirm(state) {
  const container = state?.container || state || {};
  if (getFrBaselineRevisionId(container)) return false;
  const content = extractFrContent(container, state?.srsProposal || null);
  if (Number(content.frCount) > 0) return true;
  return Boolean(getCurrentRequirementsRevisionId(container, 'fr'));
}

/**
 * After WhatFrTool success — stamp immutable FR revision (idempotent by contentHash).
 * @param {object} container
 * @param {{ runId?: string, toolName?: string, createdBy?: string|null, srsProposal?: object|null }} [meta]
 */
function stampFrRevisionAfterTool(container, meta = {}) {
  const content = extractFrContent(container, meta.srsProposal || null);
  const existingId = getCurrentRequirementsRevisionId(container, 'fr');
  const { hashRevisionContent } = require('./revisionIds');
  const hash = hashRevisionContent(content);
  const list = container?.requirements?.revisions?.fr;
  if (Array.isArray(list) && list.length) {
    const tip = [...list].reverse().find((r) => r?.status === 'current') || list[list.length - 1];
    if (tip?.contentHash === hash) {
      return { container, revision: tip, created: false };
    }
  }
  if (!content.frCount && !existingId) {
    return { container, revision: null, created: false };
  }
  const revision = buildArtifactRevision({
    kind: 'fr',
    artifactId: 'fr-01',
    parentRevisionId: existingId,
    origin: ORIGINS.AI_GENERATED,
    content,
    runId: meta.runId || null,
    toolName: meta.toolName || 'WhatFrTool',
    createdBy: meta.createdBy || null,
    provenance: {
      origin: ORIGINS.AI_GENERATED,
      runId: meta.runId || null,
      toolName: meta.toolName || 'WhatFrTool',
      inputRevisionId: null,
      outputValidated: true,
    },
  });
  const next = appendRequirementsArtifactRevision(container, revision);
  return { container: next, revision, created: true };
}

/**
 * Pin FR baseline after human confirm (idempotent if already same id).
 * @param {object} container
 * @param {{ revisionId?: string|null, actorUserId?: string|null, requestId?: string|null }} opts
 */
function pinFrBaseline(container, opts = {}) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const requirements = { ...(base.requirements || {}) };
  const revisionId =
    String(opts.revisionId || '').trim() ||
    getCurrentRequirementsRevisionId(base, 'fr') ||
    null;
  if (!revisionId) {
    const err = new Error('Cannot pin FR baseline — no fr revision');
    err.code = 'FR_REVISION_MISSING';
    err.statusCode = 400;
    throw err;
  }
  if (requirements.frBaselineRevisionId === revisionId) {
    return { container: base, revisionId, duplicated: true };
  }
  requirements.frBaselineRevisionId = revisionId;
  requirements.frBaselinePinnedAt = new Date().toISOString();
  requirements.frBaselinePinnedBy = opts.actorUserId || null;
  if (opts.requestId) {
    requirements.frBaselinePinRequestId = String(opts.requestId);
  }
  base.requirements = requirements;
  return { container: base, revisionId, duplicated: false };
}

/**
 * Apply human resume for fr_confirm (idempotent on requestId).
 * @param {object} state
 * @param {object} humanResume
 */
function applyFrConfirmResume(state, humanResume = {}) {
  const action = String(humanResume.action || humanResume.decision || '')
    .trim()
    .toLowerCase();
  const kind = String(humanResume.kind || '').trim().toLowerCase();
  if (kind && kind !== 'fr_confirm') {
    return { state, applied: false };
  }
  if (action && action !== 'confirm' && action !== 'fr_confirm' && action !== 'approve') {
    return { state, applied: false };
  }
  const requestId = humanResume.requestId || humanResume.idempotencyKey || null;
  const container = state?.container || {};
  if (
    requestId &&
    container?.requirements?.frBaselinePinRequestId &&
    String(container.requirements.frBaselinePinRequestId) === String(requestId)
  ) {
    return { state, applied: true, duplicated: true };
  }
  const pinned = pinFrBaseline(container, {
    revisionId: humanResume.frRevisionId || humanResume.revisionId || null,
    actorUserId: humanResume.actorUserId || humanResume.userId || null,
    requestId,
  });
  return {
    state: {
      ...state,
      container: pinned.container,
      history: [`fr_baseline_pinned:${pinned.revisionId}`],
      humanResume: null,
    },
    applied: true,
    duplicated: pinned.duplicated,
  };
}

module.exports = {
  getFrBaselineRevisionId,
  needsFrConfirm,
  stampFrRevisionAfterTool,
  pinFrBaseline,
  applyFrConfirmResume,
  extractFrContent,
};
