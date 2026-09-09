/**
 * Scale-first A2/A3 — Task domain events (RabbitMQ topic voicehub.topic).
 * Additive contracts; không thay orgEvents / contract API HTTP.
 * Ownership Task API: project-service (không còn task-service split).
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const TASK_DOMAIN_EVENT_TYPES = {
  TASK_CREATED: 'task.v1.created',
  TASK_UPDATED: 'task.v1.updated',
  TASK_STATUS_CHANGED: 'task.v1.status_changed',
  TASK_DELETED: 'task.v1.deleted',
  WORKLOG_RECORDED: 'task.v1.worklog_recorded',
  CARD_MOVED: 'task.v1.card_moved',
};

const CATALOG = [
  {
    type: TASK_DOMAIN_EVENT_TYPES.TASK_CREATED,
    publisher: 'project-service',
    consumers: ['report-etl', 'notification-service'],
    description: 'Task được tạo.',
  },
  {
    type: TASK_DOMAIN_EVENT_TYPES.TASK_UPDATED,
    publisher: 'project-service',
    consumers: ['report-etl'],
    description: 'Cập nhật field task (không gồm chỉ status).',
  },
  {
    type: TASK_DOMAIN_EVENT_TYPES.TASK_STATUS_CHANGED,
    publisher: 'project-service',
    consumers: ['report-etl', 'notification-service'],
    description: 'Đổi status / workflow state.',
  },
  {
    type: TASK_DOMAIN_EVENT_TYPES.TASK_DELETED,
    publisher: 'project-service',
    consumers: ['report-etl'],
    description: 'Xóa hoặc archive cứng task.',
  },
  {
    type: TASK_DOMAIN_EVENT_TYPES.WORKLOG_RECORDED,
    publisher: 'project-service',
    consumers: ['report-etl'],
    description: 'Worklog mới — nguồn utilization analytics.',
  },
  {
    type: TASK_DOMAIN_EVENT_TYPES.CARD_MOVED,
    publisher: 'project-service',
    consumers: ['report-etl'],
    description: 'Board card move — sync status/list.',
  },
];

const TASK_EVENTS_PROJECT_QUEUE =
  process.env.RABBITMQ_TASK_EVENTS_PROJECT_QUEUE || 'voicehub.task.events.project';
const TASK_EVENTS_ETL_QUEUE =
  process.env.RABBITMQ_TASK_EVENTS_ETL_QUEUE || 'voicehub.task.events.etl';
const TASK_EVENTS_PROJECT_DLQ = `${TASK_EVENTS_PROJECT_QUEUE}.dlq`;
const TASK_EVENTS_ETL_DLQ = `${TASK_EVENTS_ETL_QUEUE}.dlq`;

const BINDING_KEYS = Object.values(TASK_DOMAIN_EVENT_TYPES);

/**
 * @param {string} type
 * @returns {string}
 */
function routingKeyForTaskEventType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return TASK_DOMAIN_EVENT_TYPES.TASK_UPDATED;
}

function isKnownTaskDomainEventType(type) {
  return BINDING_KEYS.includes(String(type || '').trim());
}

/**
 * Envelope chuẩn — schemaVersion tăng khi breaking.
 * @param {object} partial
 */
function buildTaskDomainEventEnvelope(partial = {}) {
  const type = String(partial.type || '').trim();
  if (!isKnownTaskDomainEventType(type)) {
    throw new Error(`Unknown task domain event type: ${type}`);
  }
  return {
    schemaVersion: 1,
    eventId: String(partial.eventId || ''),
    type,
    occurredAt: partial.occurredAt || new Date().toISOString(),
    organizationId: partial.organizationId != null ? String(partial.organizationId) : undefined,
    projectId: partial.projectId != null ? String(partial.projectId) : undefined,
    taskId: partial.taskId != null ? String(partial.taskId) : undefined,
    payload: partial.payload && typeof partial.payload === 'object' ? partial.payload : {},
  };
}

module.exports = {
  TASK_DOMAIN_EVENT_EXCHANGE: EXCHANGE,
  TASK_DOMAIN_EVENT_TYPES,
  TASK_DOMAIN_EVENT_CATALOG: CATALOG,
  TASK_EVENTS_PROJECT_QUEUE,
  TASK_EVENTS_ETL_QUEUE,
  TASK_EVENTS_PROJECT_DLQ,
  TASK_EVENTS_ETL_DLQ,
  TASK_DOMAIN_EVENT_BINDING_KEYS: BINDING_KEYS,
  routingKeyForTaskEventType,
  isKnownTaskDomainEventType,
  buildTaskDomainEventEnvelope,
};
