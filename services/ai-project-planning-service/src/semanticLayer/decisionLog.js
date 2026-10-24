/**
 * Append-only decision log. Each event names the actor, time, version, and reason.
 */

const REQUIRED = ['actorId', 'at', 'subjectVersionId', 'reason', 'action'];

function appendDecision(events = [], decision = {}) {
  for (const key of REQUIRED) {
    if (!decision[key]) {
      const error = new Error(`DecisionEvent missing ${key}`);
      error.code = 'DECISION_INCOMPLETE';
      throw error;
    }
  }
  return Object.freeze([
    ...events,
    Object.freeze({
      seq: events.length + 1,
      actorId: decision.actorId,
      at: decision.at,
      subjectVersionId: decision.subjectVersionId,
      reason: decision.reason,
      action: decision.action,
    }),
  ]);
}

module.exports = {
  appendDecision,
};
