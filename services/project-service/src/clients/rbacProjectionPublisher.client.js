/**
 * Optional publisher — project-service emit project member role facts (B3).
 */

const {
  RBAC_PROJECTION_EVENT_TYPES,
  buildRbacProjectionEnvelope,
  routingKeyForRbacProjectionType,
  RBAC_PROJECTION_EVENT_EXCHANGE,
} = require('@enterprise/shared/messaging/rbacProjectionEvents');

/**
 * @param {import('amqplib').Channel} ch
 * @param {object} partial
 */
async function publishRbacProjectionEvent(ch, partial) {
  const envelope = buildRbacProjectionEnvelope({
    ...partial,
    type: partial.type || RBAC_PROJECTION_EVENT_TYPES.PROJECT_MEMBER_ROLES_CHANGED,
  });
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
