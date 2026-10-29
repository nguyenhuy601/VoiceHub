/**
 * Pack-side WBS baseline pin + lightweight human edit audit (HOW).
 * Full impact policy lives in ai-project-planning-service; this keeps Pack SoT in sync
 * for soft checkpoint (no LangGraph interrupt) and Gate2 UI.
 */

const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function getCurrentWbsRevisionId(container) {
  const fromMap = container?.planning?.currentRevisionIds?.wbs;
  if (fromMap) return String(fromMap);
  const list = container?.planning?.revisions?.wbs;
  if (!Array.isArray(list) || !list.length) return null;
  const tip = [...list].reverse().find((r) => r?.status === 'current');
  return tip?.revisionId || list[list.length - 1]?.revisionId || null;
}

/**
 * Ensure a tip WBS revision exists on pack (soft sync when AI stamp not mirrored yet).
 * @param {object} container
 * @param {string|null} preferredRevisionId
 */
function ensurePackWbsRevisionTip(container, preferredRevisionId = null) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const existing = getCurrentWbsRevisionId(base);
  if (existing) {
    if (preferredRevisionId && preferredRevisionId !== existing) {
      // Prefer client/AI revision id as baseline tip without rewriting content history
      planning.currentRevisionIds = {
        ...(planning.currentRevisionIds || {}),
        wbs: String(preferredRevisionId),
      };
      const list = Array.isArray(planning.revisions?.wbs) ? [...planning.revisions.wbs] : [];
      if (!list.some((r) => r && r.revisionId === preferredRevisionId)) {
        list.push({
          revisionId: String(preferredRevisionId),
          kind: 'wbs',
          status: 'current',
          origin: 'AI_GENERATED',
          content: { tasks: Array.isArray(planning.tasks) ? planning.tasks : [] },
          createdAt: new Date().toISOString(),
        });
        planning.revisions = { ...(planning.revisions || {}), wbs: list };
      }
      base.planning = planning;
      return { container: base, revisionId: String(preferredRevisionId) };
    }
    return { container: base, revisionId: existing };
  }
  const revisionId = String(preferredRevisionId || '').trim() || newId('wbs-r');
  planning.revisions = {
    ...(planning.revisions || {}),
    wbs: [
      {
        revisionId,
        kind: 'wbs',
        status: 'current',
        origin: 'AI_GENERATED',
        content: { tasks: Array.isArray(planning.tasks) ? planning.tasks : [] },
        createdAt: new Date().toISOString(),
      },
    ],
  };
  planning.currentRevisionIds = {
    ...(planning.currentRevisionIds || {}),
    wbs: revisionId,
  };
  base.planning = planning;
  return { container: base, revisionId };
}

/**
 * Idempotent pin on pack.aiAnalysis.planning.
 * @param {object} container
 * @param {{ revisionId?: string, actorUserId?: string, requestId?: string }} opts
 */
function pinWbsBaselineOnContainer(container, opts = {}) {
  const ensured = ensurePackWbsRevisionTip(container, opts.revisionId || null);
  const base = ensured.container;
  const planning = { ...(base.planning || {}) };
  const revisionId = ensured.revisionId;
  if (!revisionId) {
    const err = new Error('Cannot pin WBS baseline — no wbs revision on pack');
    err.statusCode = 400;
    err.errorCode = 'WBS_REVISION_MISSING';
    throw err;
  }
  if (
    planning.wbsBaselineRevisionId === revisionId &&
    opts.requestId &&
    planning.wbsBaselinePinRequestId === String(opts.requestId)
  ) {
    return { container: base, revisionId, duplicated: true };
  }
  if (
    planning.wbsBaselineRevisionId === revisionId &&
    !opts.requestId
  ) {
    return { container: base, revisionId, duplicated: true };
  }
  planning.wbsBaselineRevisionId = revisionId;
  planning.wbsBaselinePinnedAt = new Date().toISOString();
  planning.wbsBaselinePinnedBy = opts.actorUserId || null;
  if (opts.requestId) planning.wbsBaselinePinRequestId = String(opts.requestId);
  base.planning = planning;
  return { container: base, revisionId, duplicated: false };
}

/**
 * Record a pack-local change event (append-only). Does not invent full revision content.
 * @param {object} container
 * @param {object} event partial
 */
function appendPackChangeEvent(container, event) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const events = Array.isArray(planning.changeEvents) ? [...planning.changeEvents] : [];
  const requestId = event.requestId || newId('req');
  if (events.some((e) => e && e.requestId === requestId)) {
    planning.changeEvents = events;
    base.planning = planning;
    return { container: base, duplicated: true, requestId };
  }
  events.push({
    eventId: event.eventId || newId('evt'),
    action: event.action || 'human_edit',
    artifactKind: event.artifactKind || 'wbs',
    baseRevisionId: event.baseRevisionId || null,
    newRevisionId: event.newRevisionId || null,
    actor: event.actor || { userId: '', role: null },
    recordedAt: new Date().toISOString(),
    reason: String(event.reason || '').slice(0, 2000),
    changes: Array.isArray(event.changes) ? event.changes : [],
    impactAssessmentId: event.impactAssessmentId || null,
    requestId,
  });
  planning.changeEvents = events;
  base.planning = planning;
  return { container: base, duplicated: false, requestId };
}

module.exports = {
  getCurrentWbsRevisionId,
  ensurePackWbsRevisionTip,
  pinWbsBaselineOnContainer,
  appendPackChangeEvent,
};
