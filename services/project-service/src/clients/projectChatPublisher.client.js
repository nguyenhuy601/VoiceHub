/**
 * Fire-and-forget ProjectMember facts for chat-service Context Call.
 * Bật mặc định khi có RABBITMQ_URL; tắt: PROJECT_CHAT_EVENT_PUBLISH=0
 */

const crypto = require('crypto');
const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const {
  PROJECT_CHAT_EVENT_TYPES,
  PROJECT_CHAT_EVENT_EXCHANGE,
  buildProjectChatEventEnvelope,
  routingKeyForProjectChatType,
} = require('@enterprise/shared/messaging/projectChatEvents');
const { isPublishEnabled } = require('../utils/projectChatPublishFlags');

async function publishProjectChatEventFireAndForget(partial) {
  if (!isPublishEnabled()) return false;
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    logger.warn('[projectChat] skip publish: RABBITMQ_URL missing');
    return false;
  }
  try {
    const envelope = buildProjectChatEventEnvelope({
      ...partial,
      type: partial.type || PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
      eventId: partial.eventId || crypto.randomUUID(),
    });
    const conn = await amqp.connect(url);
    try {
      const ch = await conn.createChannel();
      await ch.assertExchange(PROJECT_CHAT_EVENT_EXCHANGE, 'topic', { durable: true });
      const key = routingKeyForProjectChatType(envelope.type);
      ch.publish(PROJECT_CHAT_EVENT_EXCHANGE, key, Buffer.from(JSON.stringify(envelope)), {
        persistent: true,
        contentType: 'application/json',
      });
      await ch.close();
    } finally {
      await conn.close();
    }
    return true;
  } catch (err) {
    logger.warn('[projectChat] publish failed', err.message);
    return false;
  }
}

function emitProjectMemberChangedBestEffort({ organizationId, projectId, userId, status }) {
  const st = String(status || '').trim().toLowerCase();
  if (!organizationId || !projectId || !userId || !st) return;
  publishProjectChatEventFireAndForget({
    type: PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED,
    organizationId,
    projectId,
    userId,
    status: st,
    payload: { status: st },
  }).catch(() => null);
}

function emitProjectCoreChannelsProvisionBestEffort({
  organizationId,
  projectId,
  projectTitle,
  createdBy,
  writerUserIds,
}) {
  if (!organizationId || !projectId) return;
  publishProjectChatEventFireAndForget({
    type: PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION,
    organizationId,
    projectId,
    userId: createdBy || undefined,
    payload: {
      kind: 'core',
      projectTitle: String(projectTitle || '').trim(),
      createdBy: createdBy || null,
      writerUserIds: Array.isArray(writerUserIds)
        ? writerUserIds.map(String).filter(Boolean)
        : [],
    },
  }).catch(() => null);
}

function emitProjectTeamChannelProvisionBestEffort({
  organizationId,
  projectId,
  teamId,
  projectTitle,
  createdBy,
}) {
  const tid = String(teamId || '').trim();
  if (!organizationId || !projectId || !tid) return;
  publishProjectChatEventFireAndForget({
    type: PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION,
    organizationId,
    projectId,
    userId: createdBy || undefined,
    payload: {
      kind: 'team',
      teamId: tid,
      projectTitle: String(projectTitle || '').trim(),
      createdBy: createdBy || null,
    },
  }).catch(() => null);
}

/**
 * Significant Work change → chat #announcement (fire-and-forget).
 * @param {{
 *   organizationId: string,
 *   projectId: string,
 *   actorId: string,
 *   taskId?: string,
 *   boardId?: string,
 *   activityLogId?: string,
 *   field: string,
 *   from?: unknown,
 *   to?: unknown,
 *   label?: string,
 *   taskTitle?: string,
 * }} partial
 */
function emitWorkActivityBestEffort(partial = {}) {
  const organizationId = String(partial.organizationId || '').trim();
  const projectId = String(partial.projectId || '').trim();
  const field = String(partial.field || '').trim();
  if (!organizationId || !projectId || !field) return;
  const activityLogId = String(partial.activityLogId || '').trim();
  const eventId = activityLogId
    ? `work-activity:${activityLogId}`
    : undefined;
  publishProjectChatEventFireAndForget({
    type: PROJECT_CHAT_EVENT_TYPES.WORK_ACTIVITY,
    eventId,
    organizationId,
    projectId,
    userId: partial.actorId || undefined,
    payload: {
      field,
      from: partial.from ?? null,
      to: partial.to ?? null,
      taskId: partial.taskId ? String(partial.taskId) : null,
      boardId: partial.boardId ? String(partial.boardId) : null,
      activityLogId: activityLogId || null,
      label: partial.label ? String(partial.label).slice(0, 120) : '',
      taskTitle: partial.taskTitle ? String(partial.taskTitle).slice(0, 200) : '',
      kind: 'task',
    },
  }).catch(() => null);
}

module.exports = {
  PROJECT_CHAT_EVENT_TYPES,
  isPublishEnabled,
  publishProjectChatEventFireAndForget,
  emitProjectMemberChangedBestEffort,
  emitProjectCoreChannelsProvisionBestEffort,
  emitProjectTeamChannelProvisionBestEffort,
  emitWorkActivityBestEffort,
};
