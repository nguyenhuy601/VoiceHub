/**
 * Scale-first C4 — Analytics / warehouse feed events (additive).
 * ETL consume → analytics store riêng; report-service chỉ đọc warehouse.
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const ANALYTICS_EVENT_TYPES = {
  TASK_FACT: 'analytics.v1.task_fact',
  WORKLOG_FACT: 'analytics.v1.worklog_fact',
  PROJECT_FACT: 'analytics.v1.project_fact',
  MEMBERSHIP_FACT: 'analytics.v1.membership_fact',
  UTILIZATION_SNAPSHOT: 'analytics.v1.utilization_snapshot',
};

const CATALOG = [
  {
    type: ANALYTICS_EVENT_TYPES.TASK_FACT,
    publisher: 'task-service',
    consumers: ['report-etl'],
    description: 'Denormalized task fact cho warehouse.',
  },
  {
    type: ANALYTICS_EVENT_TYPES.WORKLOG_FACT,
    publisher: 'task-service',
    consumers: ['report-etl'],
    description: 'Worklog hours fact.',
  },
  {
    type: ANALYTICS_EVENT_TYPES.PROJECT_FACT,
    publisher: 'project-service',
    consumers: ['report-etl'],
    description: 'Project meta / health inputs.',
  },
  {
    type: ANALYTICS_EVENT_TYPES.MEMBERSHIP_FACT,
    publisher: 'organization-service',
    consumers: ['report-etl'],
    description: 'Org membership headcount / role fact (không PII thừa).',
  },
  {
    type: ANALYTICS_EVENT_TYPES.UTILIZATION_SNAPSHOT,
    publisher: 'report-etl',
    consumers: ['report-service'],
    description: 'Snapshot đã materialize — report-service đọc DB warehouse, event optional notify.',
  },
];

const ANALYTICS_ETL_QUEUE =
  process.env.RABBITMQ_ANALYTICS_ETL_QUEUE || 'voicehub.analytics.etl';
const ANALYTICS_ETL_DLQ = `${ANALYTICS_ETL_QUEUE}.dlq`;

const BINDING_KEYS = Object.values(ANALYTICS_EVENT_TYPES);

function routingKeyForAnalyticsType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return ANALYTICS_EVENT_TYPES.TASK_FACT;
}

function isKnownAnalyticsEventType(type) {
  return BINDING_KEYS.includes(String(type || '').trim());
}

/**
 * @param {object} partial
 */
function buildAnalyticsEnvelope(partial = {}) {
  const type = String(partial.type || '').trim();
  if (!isKnownAnalyticsEventType(type)) {
    throw new Error(`Unknown analytics event type: ${type}`);
  }
  return {
    schemaVersion: 1,
    eventId: String(partial.eventId || ''),
    type,
    occurredAt: partial.occurredAt || new Date().toISOString(),
    organizationId: partial.organizationId != null ? String(partial.organizationId) : undefined,
    projectId: partial.projectId != null ? String(partial.projectId) : undefined,
    asOf: partial.asOf || undefined,
    payload: partial.payload && typeof partial.payload === 'object' ? partial.payload : {},
  };
}

module.exports = {
  ANALYTICS_EVENT_EXCHANGE: EXCHANGE,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_EVENT_CATALOG: CATALOG,
  ANALYTICS_ETL_QUEUE,
  ANALYTICS_ETL_DLQ,
  ANALYTICS_EVENT_BINDING_KEYS: BINDING_KEYS,
  routingKeyForAnalyticsType,
  isKnownAnalyticsEventType,
  buildAnalyticsEnvelope,
};
