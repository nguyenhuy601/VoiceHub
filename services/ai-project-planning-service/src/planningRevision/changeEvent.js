/**
 * Append-only human/system change events for HOW planning artifacts.
 */

const { newEventId, newRequestId } = require('./revisionIds');

const ConflictError = class extends Error {
  constructor(message, extras = {}) {
    super(message);
    this.name = 'RevisionConflictError';
    this.code = 'REVISION_CONFLICT';
    this.statusCode = 409;
    Object.assign(this, extras);
  }
};

/**
 * Optimistic concurrency: request must target current tip.
 * @param {string|null|undefined} currentRevisionId
 * @param {string|null|undefined} baseRevisionId
 */
function assertBaseRevision(currentRevisionId, baseRevisionId) {
  const current = String(currentRevisionId || '').trim();
  const base = String(baseRevisionId || '').trim();
  if (!base) {
    const err = new Error('baseRevisionId is required for human edit');
    err.code = 'BASE_REVISION_REQUIRED';
    err.statusCode = 400;
    throw err;
  }
  if (current && base !== current) {
    throw new ConflictError(
      `baseRevisionId ${base} does not match current ${current}`,
      { currentRevisionId: current, baseRevisionId: base }
    );
  }
  return true;
}

/**
 * @param {object} opts
 * @returns {object}
 */
function buildChangeEvent(opts = {}) {
  const actor =
    opts.actor && typeof opts.actor === 'object'
      ? {
          userId: String(opts.actor.userId || ''),
          role: opts.actor.role || null,
        }
      : { userId: '', role: null };

  return Object.freeze({
    eventId: opts.eventId || newEventId(),
    action: opts.action || 'human_edit',
    artifactId: opts.artifactId || null,
    artifactKind: opts.artifactKind || 'wbs',
    baseRevisionId: opts.baseRevisionId || null,
    newRevisionId: opts.newRevisionId || null,
    actor,
    recordedAt: opts.recordedAt || new Date().toISOString(),
    reason: String(opts.reason || '').slice(0, 2000),
    changes: Array.isArray(opts.changes) ? opts.changes.map((c) => ({ ...c })) : [],
    impactAssessmentId: opts.impactAssessmentId || null,
    requestId: opts.requestId || newRequestId(),
  });
}

/**
 * Append change event; idempotent on requestId or eventId.
 * @param {object} container
 * @param {object} event
 */
function appendChangeEvent(container, event) {
  const base = container && typeof container === 'object' ? { ...container } : {};
  const planning = { ...(base.planning || {}) };
  const events = Array.isArray(planning.changeEvents) ? [...planning.changeEvents] : [];
  if (
    events.some(
      (e) =>
        e &&
        (e.eventId === event.eventId ||
          (event.requestId && e.requestId === event.requestId))
    )
  ) {
    planning.changeEvents = events;
    base.planning = planning;
    return { container: base, duplicated: true };
  }
  events.push(event);
  planning.changeEvents = events;
  base.planning = planning;
  return { container: base, duplicated: false };
}

module.exports = {
  ConflictError,
  assertBaseRevision,
  buildChangeEvent,
  appendChangeEvent,
};
