/**
 * ADR-005 — Dashboard read-model projection (additive).
 * Reuse analytics task/worklog/membership facts + dashboard-specific refresh.
 */

const {
  ANALYTICS_EVENT_EXCHANGE,
  ANALYTICS_EVENT_TYPES,
} = require('./analyticsEvents');

/** @readonly */
const DASHBOARD_PROJECTION_EVENT_TYPES = {
  TASK_FACT: ANALYTICS_EVENT_TYPES.TASK_FACT,
  WORKLOG_FACT: ANALYTICS_EVENT_TYPES.WORKLOG_FACT,
  MEMBERSHIP_FACT: ANALYTICS_EVENT_TYPES.MEMBERSHIP_FACT,
  USER_SNAPSHOT: 'dashboard.v1.user_snapshot',
  REFRESH_REQUESTED: 'dashboard.v1.refresh_requested',
};

const DASHBOARD_PROJECTION_QUEUE =
  process.env.RABBITMQ_DASHBOARD_PROJECTION_QUEUE || 'voicehub.dashboard.projection';
const DASHBOARD_PROJECTION_DLQ = `${DASHBOARD_PROJECTION_QUEUE}.dlq`;

const BINDING_KEYS = [...new Set(Object.values(DASHBOARD_PROJECTION_EVENT_TYPES))];

function isKnownDashboardProjectionEventType(type) {
  return BINDING_KEYS.includes(String(type || '').trim());
}

function routingKeyForDashboardProjectionType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return DASHBOARD_PROJECTION_EVENT_TYPES.REFRESH_REQUESTED;
}

/**
 * @param {object} partial
 */
function buildDashboardProjectionEnvelope(partial = {}) {
  const type = String(partial.type || '').trim();
  if (!isKnownDashboardProjectionEventType(type)) {
    throw new Error(`Unknown dashboard projection event type: ${type}`);
  }
  return {
    schemaVersion: 1,
    eventId: String(partial.eventId || ''),
    type,
    occurredAt: partial.occurredAt || new Date().toISOString(),
    organizationId: partial.organizationId != null ? String(partial.organizationId) : undefined,
    userId: partial.userId != null ? String(partial.userId) : undefined,
    asOf: partial.asOf || undefined,
    payload: partial.payload && typeof partial.payload === 'object' ? partial.payload : {},
  };
}

function dashboardReadModelKey(userId) {
  return `dash:rm:user:${String(userId)}`;
}

function dashboardReadModelEventsKey(userId) {
  return `dash:rm:user:${String(userId)}:events`;
}

module.exports = {
  DASHBOARD_PROJECTION_EVENT_EXCHANGE: ANALYTICS_EVENT_EXCHANGE,
  DASHBOARD_PROJECTION_EVENT_TYPES,
  DASHBOARD_PROJECTION_QUEUE,
  DASHBOARD_PROJECTION_DLQ,
  DASHBOARD_PROJECTION_BINDING_KEYS: BINDING_KEYS,
  isKnownDashboardProjectionEventType,
  routingKeyForDashboardProjectionType,
  buildDashboardProjectionEnvelope,
  dashboardReadModelKey,
  dashboardReadModelEventsKey,
};
