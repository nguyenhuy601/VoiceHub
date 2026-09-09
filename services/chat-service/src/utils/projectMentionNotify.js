const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const { isFocusedOnProjectRoom } = require('./projectRoomFocus');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { buildProjectMentionActionUrl } = require('./projectMentionActionUrl');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isProjectMentionNotifyEnabled() {
  const raw = String(process.env.PROJECT_CHAT_MENTION_NOTIFY ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function notificationAxiosOpts() {
  const opts = { timeout: 8000, validateStatus: () => true };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function uniqueIds(ids, excludeUserId) {
  const ex = String(excludeUserId || '').trim();
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))].filter(
    (id) => id !== ex
  );
}

function buildPreview(message) {
  const text = String(message?.content || '').trim();
  if (!text) return 'Bạn được nhắc trong kênh dự án';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

async function resolveSenderDisplayName(senderId) {
  try {
    const res = await fetchUserProfileByIdInternal(senderId);
    if (res?.status !== 200) return 'Thành viên';
    const u = res?.data?.data ?? res?.data;
    const parts = [u?.lastName, u?.firstName].filter(Boolean).join(' ').trim();
    const name = String(parts || u?.fullName || u?.displayName || u?.username || '').trim();
    return name || 'Thành viên';
  } catch {
    return 'Thành viên';
  }
}

/**
 * Resolve userId được @mention qua org internal ai-task-context + optional body ids.
 */
async function resolveMentionedUserIds({
  organizationId,
  roomId,
  messageText,
  mentionedUserIds,
  senderId,
}) {
  const fromBody = uniqueIds(mentionedUserIds, senderId);
  const text = String(messageText || '');
  if (!text.includes('@') && !fromBody.length) return [];

  const uidSet = new Set(fromBody);
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !text.includes('@')) {
    return [...uidSet];
  }

  try {
    const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/ai-task-context`;
    const res = await axios.post(
      url,
      {
        organizationId: String(organizationId),
        channelId: roomId ? String(roomId) : undefined,
        messageText: text,
        userIds: fromBody,
      },
      {
        headers: buildTrustedGatewayHeaders(String(senderId || 'system')),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 200 && res.status < 300) {
      const mentioned = res.data?.data?.mentionedUsers || res.data?.mentionedUsers || [];
      for (const row of mentioned) {
        const id = String(row?.userId || row?.id || '').trim();
        if (id) uidSet.add(id);
      }
    }
  } catch {
    /* keep body ids */
  }

  return uniqueIds([...uidSet], senderId);
}

function buildActionUrl({ organizationId, roomId, projectId }) {
  return buildProjectMentionActionUrl({ organizationId, roomId, projectId });
}

/**
 * Inbox P0 khi @mention trên Project Chat — không notify tin thường.
 */
async function maybeNotifyProjectMentions({ message, mentionedUserIds, roomMeta }) {
  if (!isProjectMentionNotifyEnabled()) return;
  if (!NOTIFICATION_SERVICE_URL || !NOTIFICATION_INTERNAL_TOKEN) return;

  const senderId = String(message?.senderId?._id || message?.senderId || '').trim();
  const organizationId = String(message?.organizationId || '').trim();
  const roomId = String(message?.roomId || '').trim();
  if (!senderId || !organizationId || !roomId) return;

  const content = String(message?.content || '');
  if (!content.includes('@') && !(Array.isArray(mentionedUserIds) && mentionedUserIds.length)) {
    return;
  }

  const recipients = await resolveMentionedUserIds({
    organizationId,
    roomId,
    messageText: content,
    mentionedUserIds,
    senderId,
  });
  if (!recipients.length) return;

  const projectId = String(roomMeta?.projectId || message?.visibility?.projectId || '').trim();
  const senderName = await resolveSenderDisplayName(senderId);
  const preview = buildPreview(message);
  const messageId = String(message?._id || message?.id || '').trim();
  const actionUrl = buildActionUrl({ organizationId, roomId, projectId });

  await Promise.all(
    recipients.map(async (userId) => {
      if (await isFocusedOnProjectRoom(userId, roomId)) return;
      try {
        const res = await axios.post(
          `${NOTIFICATION_SERVICE_URL}/api/notifications`,
          {
            userId,
            type: 'message',
            title: `${senderName} nhắc bạn`,
            content: preview,
            data: {
              kind: 'project_mention',
              senderId,
              messageId: messageId || undefined,
              organizationId,
              roomId,
              projectId: projectId || undefined,
            },
            actionUrl,
          },
          notificationAxiosOpts()
        );
        if (res.status < 200 || res.status >= 300) {
          console.warn(
            '[projectMentionNotify] failed',
            res.status,
            res.data?.message || res.data
          );
        }
      } catch (err) {
        console.warn('[projectMentionNotify] error:', err.message);
      }
    })
  );
}

module.exports = {
  isProjectMentionNotifyEnabled,
  maybeNotifyProjectMentions,
  resolveMentionedUserIds,
  buildActionUrl,
};
