/**
 * Optional publishers — org/project gọi khi sẵn sàng emit (B3).
 * Không gắn vào route hiện tại (backward compatible).
 */

const {
  RBAC_PROJECTION_EVENT_TYPES,
  buildRbacProjectionEnvelope,
  routingKeyForRbacProjectionType,
  RBAC_PROJECTION_EVENT_EXCHANGE,
} = require('@enterprise/shared/messaging/rbacProjectionEvents');

/**
 * @param {import('amqplib').Channel} ch
 * @param {object} partial — fields for buildRbacProjectionEnvelope
 */
async function publishRbacProjectionEvent(ch, partial) {
  const envelope = buildRbacProjectionEnvelope(partial);
  const key = routingKeyForRbacProjectionType(envelope.type);
  ch.publish(
    RBAC_PROJECTION_EVENT_EXCHANGE,
    key,
    Buffer.from(JSON.stringify(envelope)),
    { persistent: true, contentType: 'application/json' }
  );
  return envelope;
}

module.exports = {
  RBAC_PROJECTION_EVENT_TYPES,
  publishRbacProjectionEvent,
};
