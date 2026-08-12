/**
 * Scale-first B3 — RBAC projection events (additive; không thay orgEvents wave-3a).
 * role-permission-service consume → UserRole bindings + permission cache invalidate.
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const RBAC_PROJECTION_EVENT_TYPES = {
  MEMBERSHIP_CHANGED: 'rbac.v1.membership.changed',
  ORG_ROLE_CATALOG_CHANGED: 'rbac.v1.org_role_catalog.changed',
  PROJECT_MEMBER_ROLES_CHANGED: 'rbac.v1.project_member_roles.changed',
  PERMISSION_CACHE_INVALIDATE: 'rbac.v1.permission_cache.invalidate',
};

const CATALOG = [
  {
    type: RBAC_PROJECTION_EVENT_TYPES.MEMBERSHIP_CHANGED,
    publisher: 'organization-service',
    consumers: ['role-permission-service'],
    description: 'Membership join/leave/role fact đổi — RP rebind projection.',
  },
  {
    type: RBAC_PROJECTION_EVENT_TYPES.ORG_ROLE_CATALOG_CHANGED,
    publisher: 'organization-service',
    consumers: ['role-permission-service'],
    description: 'OrgRoleCatalog create/update/reorder — không chứa permission bits.',
  },
  {
    type: RBAC_PROJECTION_EVENT_TYPES.PROJECT_MEMBER_ROLES_CHANGED,
    publisher: 'project-service',
    consumers: ['role-permission-service'],
    description: 'Project/board member roles đổi — projection scope project.',
  },
  {
    type: RBAC_PROJECTION_EVENT_TYPES.PERMISSION_CACHE_INVALIDATE,
    publisher: 'role-permission-service',
    consumers: ['api-gateway', 'role-permission-service'],
    description: 'Broadcast invalidate permission cache keys.',
  },
];

const RBAC_PROJECTION_QUEUE =
  process.env.RABBITMQ_RBAC_PROJECTION_QUEUE || 'voicehub.rbac.projection';
const RBAC_PROJECTION_DLQ = `${RBAC_PROJECTION_QUEUE}.dlq`;
const RBAC_CACHE_INVALIDATE_QUEUE =
  process.env.RABBITMQ_RBAC_CACHE_INVALIDATE_QUEUE || 'voicehub.rbac.cache.invalidate';

const BINDING_KEYS = Object.values(RBAC_PROJECTION_EVENT_TYPES);

function routingKeyForRbacProjectionType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return RBAC_PROJECTION_EVENT_TYPES.PERMISSION_CACHE_INVALIDATE;
}

function isKnownRbacProjectionEventType(type) {
  return BINDING_KEYS.includes(String(type || '').trim());
}

/**
 * @param {object} partial
 */
function buildRbacProjectionEnvelope(partial = {}) {
  const type = String(partial.type || '').trim();
  if (!isKnownRbacProjectionEventType(type)) {
    throw new Error(`Unknown rbac projection event type: ${type}`);
  }
  return {
    schemaVersion: 1,
    eventId: String(partial.eventId || ''),
    type,
    occurredAt: partial.occurredAt || new Date().toISOString(),
    organizationId: partial.organizationId != null ? String(partial.organizationId) : undefined,
    projectId: partial.projectId != null ? String(partial.projectId) : undefined,
    userId: partial.userId != null ? String(partial.userId) : undefined,
    payload: partial.payload && typeof partial.payload === 'object' ? partial.payload : {},
  };
}

module.exports = {
  RBAC_PROJECTION_EVENT_EXCHANGE: EXCHANGE,
  RBAC_PROJECTION_EVENT_TYPES,
  RBAC_PROJECTION_EVENT_CATALOG: CATALOG,
  RBAC_PROJECTION_QUEUE,
  RBAC_PROJECTION_DLQ,
  RBAC_CACHE_INVALIDATE_QUEUE,
  RBAC_PROJECTION_BINDING_KEYS: BINDING_KEYS,
  routingKeyForRbacProjectionType,
  isKnownRbacProjectionEventType,
  buildRbacProjectionEnvelope,
};
