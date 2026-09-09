/**
 * Project chat bridge events (additive).
 * Membership facts → chat-service + org-service.
 * Channel provision → org-service only (SSOT Channel; project-service không ghi Channel).
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const PROJECT_CHAT_EVENT_TYPES = {
  MEMBER_CHANGED: 'project.v1.member.changed',
  CHANNEL_PROVISION: 'project.v1.channel.provision',
  /** Significant Work field change → #announcement contextual message */
  WORK_ACTIVITY: 'project.v1.work.activity',
};

const CATALOG = [
  {
    type: PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
    publisher: 'project-service',
    consumers: ['chat-service', 'organization-service'],
    description: 'ProjectMember active/inactive — cập nhật UserProjectMembership (chat + org).',
  },
  {
    type: PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION,
    publisher: 'project-service',
    consumers: ['organization-service'],
    description: 'Tạo Channel Project (core/team) — chỉ org-service ghi Channel.',
  },
  {
    type: PROJECT_CHAT_EVENT_TYPES.WORK_ACTIVITY,
    publisher: 'project-service',
    consumers: ['chat-service'],
    description: 'Significant Work field change → system message on project #announcement.',
  },
];

const CHAT_QUEUE =
  process.env.RABBITMQ_PROJECT_CHAT_EVENTS_CHAT_QUEUE || 'voicehub.project.chat.events.chat';
const CHAT_DLQ = `${CHAT_QUEUE}.dlq`;

const ORG_QUEUE =
  process.env.RABBITMQ_PROJECT_CHAT_EVENTS_ORG_QUEUE || 'voicehub.project.chat.events.org';
const ORG_DLQ = `${ORG_QUEUE}.dlq`;

/** Chat bind membership + work activity (không nhận provision). */
const BINDING_KEYS = [
  PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
  PROJECT_CHAT_EVENT_TYPES.WORK_ACTIVITY,
];

const ORG_BINDING_KEYS = [
  PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
  PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION,
];

const KNOWN_TYPES = new Set(Object.values(PROJECT_CHAT_EVENT_TYPES));

function routingKeyForProjectChatType(type) {
  const t = String(type || '').trim();
  if (KNOWN_TYPES.has(t)) return t;
  return PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED;
}

function isKnownProjectChatEventType(type) {
  return KNOWN_TYPES.has(String(type || '').trim());
}

/**
 * @param {object} partial
 */
function buildProjectChatEventEnvelope(partial = {}) {
  const type = String(partial.type || '').trim();
  if (!isKnownProjectChatEventType(type)) {
    throw new Error(`Unknown project chat event type: ${type}`);
  }
  const status = String(partial.status || partial.payload?.status || '').trim().toLowerCase();
  return {
    schemaVersion: 1,
    eventId: String(partial.eventId || ''),
    type,
    occurredAt: partial.occurredAt || new Date().toISOString(),
    organizationId: partial.organizationId != null ? String(partial.organizationId) : undefined,
    projectId: partial.projectId != null ? String(partial.projectId) : undefined,
    userId: partial.userId != null ? String(partial.userId) : undefined,
    payload: {
      ...(partial.payload && typeof partial.payload === 'object' ? partial.payload : {}),
      ...(status ? { status } : {}),
    },
  };
}

module.exports = {
  PROJECT_CHAT_EVENT_EXCHANGE: EXCHANGE,
  PROJECT_CHAT_EVENT_TYPES,
  PROJECT_CHAT_EVENT_CATALOG: CATALOG,
  PROJECT_CHAT_EVENTS_CHAT_QUEUE: CHAT_QUEUE,
  PROJECT_CHAT_EVENTS_CHAT_DLQ: CHAT_DLQ,
  PROJECT_CHAT_EVENTS_ORG_QUEUE: ORG_QUEUE,
  PROJECT_CHAT_EVENTS_ORG_DLQ: ORG_DLQ,
  PROJECT_CHAT_EVENT_BINDING_KEYS: BINDING_KEYS,
  PROJECT_CHAT_ORG_BINDING_KEYS: ORG_BINDING_KEYS,
  routingKeyForProjectChatType,
  isKnownProjectChatEventType,
  buildProjectChatEventEnvelope,
};
