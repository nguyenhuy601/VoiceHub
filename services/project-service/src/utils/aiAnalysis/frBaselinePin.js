/**
 * Pack-side FR baseline pin + lightweight human edit audit (WHAT).
 * Always-on checkpoint — pin requirements.frBaselineRevisionId before UC/Data.
 */

const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function getCurrentFrRevisionId(container) {
  const fromMap = container?.requirements?.currentRevisionIds?.fr;
  if (fromMap) return String(fromMap);
  const list = container?.requirements?.revisions?.fr;
  if (!Array.isArray(list) || !list.length) return null;
  const tip = [...list].reverse().find((r) => r?.status === 'current');
  return tip?.revisionId || list[list.length - 1]?.revisionId || null;
}

/**
 * Ensure a tip FR revision exists on pack (soft sync when AI stamp not mirrored yet).
 * @param {object} container
 * @param {string|null} preferredRevisionId
 */
function ensurePackFrRevisionTip(container, preferredRevisionId = null) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const requirements = { ...(base.requirements || {}) };
  const existing = getCurrentFrRevisionId(base);
  if (existing) {
    if (preferredRevisionId && preferredRevisionId !== existing) {
      requirements.currentRevisionIds = {
        ...(requirements.currentRevisionIds || {}),
        fr: String(preferredRevisionId),
      };
      const list = Array.isArray(requirements.revisions?.fr)
        ? [...requirements.revisions.fr]
        : [];
      if (!list.some((r) => r && r.revisionId === preferredRevisionId)) {
        const proposal =
          base.analyses?.srsProposal || base.srsProposal || null;
        const items =
          proposal?.generated?.functionalRequirements?.items ||
          base.functionalRequirements ||
          [];
        list.push({
          revisionId: String(preferredRevisionId),
          kind: 'fr',
          status: 'current',
          origin: 'AI_GENERATED',
          content: {
            items: Array.isArray(items) ? items : [],
            frCount: Array.isArray(items) ? items.length : 0,
          },
          createdAt: new Date().toISOString(),
        });
        requirements.revisions = { ...(requirements.revisions || {}), fr: list };
      }
      base.requirements = requirements;
      return { container: base, revisionId: String(preferredRevisionId) };
    }
    return { container: base, revisionId: existing };
  }
  const revisionId = String(preferredRevisionId || '').trim() || newId('fr-r');
  const proposal = base.analyses?.srsProposal || base.srsProposal || null;
  const items =
    proposal?.generated?.functionalRequirements?.items ||
    base.functionalRequirements ||
    [];
  requirements.revisions = {
    ...(requirements.revisions || {}),
    fr: [
      {
        revisionId,
        kind: 'fr',
        status: 'current',
        origin: 'AI_GENERATED',
        content: {
          items: Array.isArray(items) ? items : [],
          frCount: Array.isArray(items) ? items.length : 0,
        },
        createdAt: new Date().toISOString(),
      },
    ],
  };
  requirements.currentRevisionIds = {
    ...(requirements.currentRevisionIds || {}),
    fr: revisionId,
  };
  base.requirements = requirements;
  return { container: base, revisionId };
}

/**
 * Idempotent pin on pack.aiAnalysis.requirements.
 * @param {object} container
 * @param {{ revisionId?: string, actorUserId?: string, requestId?: string }} opts
 */
function pinFrBaselineOnContainer(container, opts = {}) {
  const ensured = ensurePackFrRevisionTip(container, opts.revisionId || null);
  const base = ensured.container;
  const requirements = { ...(base.requirements || {}) };
  const revisionId = ensured.revisionId;
  if (!revisionId) {
    const err = new Error('Cannot pin FR baseline — no fr revision on pack');
    err.statusCode = 400;
    err.errorCode = 'FR_REVISION_MISSING';
    throw err;
  }
  if (
    requirements.frBaselineRevisionId === revisionId &&
    opts.requestId &&
    requirements.frBaselinePinRequestId === String(opts.requestId)
  ) {
    return { container: base, revisionId, duplicated: true };
  }
  if (requirements.frBaselineRevisionId === revisionId && !opts.requestId) {
    return { container: base, revisionId, duplicated: true };
  }
  requirements.frBaselineRevisionId = revisionId;
  requirements.frBaselinePinnedAt = new Date().toISOString();
  requirements.frBaselinePinnedBy = opts.actorUserId || null;
  if (opts.requestId) requirements.frBaselinePinRequestId = String(opts.requestId);
  base.requirements = requirements;
  return { container: base, revisionId, duplicated: false };
}

/**
 * Record a pack-local FR change event (append-only on requirements.changeEvents).
 * @param {object} container
 * @param {object} event partial
 */
function appendFrPackChangeEvent(container, event) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const requirements = { ...(base.requirements || {}) };
  const events = Array.isArray(requirements.changeEvents)
    ? [...requirements.changeEvents]
    : [];
  const requestId = event.requestId || newId('req');
  if (events.some((e) => e && e.requestId === requestId)) {
    requirements.changeEvents = events;
    base.requirements = requirements;
    return { container: base, duplicated: true, requestId };
  }
  events.push({
    eventId: event.eventId || newId('evt'),
    action: event.action || 'human_edit',
    artifactKind: event.artifactKind || 'fr',
    baseRevisionId: event.baseRevisionId || null,
    newRevisionId: event.newRevisionId || null,
    actor: event.actor || { userId: '', role: null },
    recordedAt: new Date().toISOString(),
    reason: String(event.reason || '').slice(0, 2000),
    changes: Array.isArray(event.changes) ? event.changes : [],
    impactAssessmentId: event.impactAssessmentId || null,
    requestId,
  });
  requirements.changeEvents = events;
  base.requirements = requirements;
  return { container: base, duplicated: false, requestId };
}

module.exports = {
  getCurrentFrRevisionId,
  ensurePackFrRevisionTip,
  pinFrBaselineOnContainer,
  appendFrPackChangeEvent,
};
