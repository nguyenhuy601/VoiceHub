/**
 * Idempotent intake. A repeated event is skipped.
 * A matching content hash does not assign an entity id.
 */

const { sha256 } = require('./hash');

function intakeKey({ organizationId, projectId, sourceId, sourceVersion, eventId }) {
  return [organizationId, projectId, sourceId, sourceVersion, eventId]
    .map((part) => String(part || '').trim())
    .join('|');
}

function hashSourceContent(payload) {
  return sha256(payload);
}

/**
 * @param {{ key: string, contentHash: string, ledger: { events: Map<string, object> } }} input
 */
function classifyIntake({ key, contentHash, ledger }) {
  const events = ledger?.events;
  if (events?.has(key)) {
    return {
      action: 'SKIP_DUPLICATE_EVENT',
      eventKey: key,
      contentHash,
      entityId: null,
    };
  }
  return {
    action: 'ACCEPT_FOR_PROCESSING',
    eventKey: key,
    contentHash,
    entityId: null,
  };
}

module.exports = {
  intakeKey,
  hashSourceContent,
  classifyIntake,
};
