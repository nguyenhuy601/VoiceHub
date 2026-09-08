/**
 * Gửi inbox qua notification-service (HTTP nội bộ).
 * Type schema chỉ gồm enum chuẩn — kind nằm trong data.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const { uniqueUserIds, projectHubActionUrl } = require('../utils/notificationTargets');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isConfigured() {
  return Boolean(NOTIFICATION_SERVICE_URL && NOTIFICATION_INTERNAL_TOKEN);
}

/**
 * @returns {Promise<boolean>}
 */
async function postBulkNotifications({
  userIds,
  type,
  title,
  content,
  data,
  actionUrl,
  excludeUserId,
}) {
  if (!isConfigured()) return false;
  const ids = uniqueUserIds(userIds, excludeUserId);
  if (!ids.length) return false;
  try {
    const res = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds: ids,
        type,
        title,
        content,
        data: data || {},
        actionUrl: actionUrl || undefined,
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      logger.warn('[notification.client] bulk HTTP %s type=%s', res.status, type);
    }
    return ok;
  } catch (err) {
    logger.warn('[notification.client] bulk failed: %s', err?.message || err);
    return false;
  }
}

async function notifySystemKind({
  userIds,
  kind,
  title,
  content,
  data,
  actionUrl,
  excludeUserId,
}) {
  const k = String(kind || '').trim();
  return postBulkNotifications({
    userIds,
    type: 'system',
    title,
    content,
    data: { ...(data || {}), kind: k },
    actionUrl,
    excludeUserId,
  });
}

function boardNotifyContext(board, task) {
  const projectId = String(board?.projectId || task?.projectId || '');
  const boardId = String(board?._id || task?.boardId || '');
  const organizationId = String(board?.organizationId || task?.organizationId || '');
  return {
    projectId,
    boardId,
    organizationId,
    actionUrl: projectHubActionUrl({ projectId, boardId, organizationId }),
  };
}

async function notifyTaskAssigned({ actorId, assigneeId, task, board, workLabel, extraData }) {
  const uid = String(assigneeId || '').trim();
  if (!uid) return false;
  const ctx = boardNotifyContext(board, task);
  const titleText = String(task?.title || 'Thẻ').trim() || 'Thẻ';
  const label = String(workLabel || 'Thẻ').trim() || 'Thẻ';
  return postBulkNotifications({
    userIds: [uid],
    type: 'task_assigned',
    title: 'Bạn được giao việc',
    content: `${label} “${titleText}” đã được giao cho bạn.`,
    data: {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      boardId: ctx.boardId,
      taskId: String(task?._id || ''),
      kind: 'task_assigned',
      ...(extraData && typeof extraData === 'object' ? extraData : {}),
    },
    actionUrl: ctx.actionUrl,
    excludeUserId: actorId,
  });
}

async function notifyTaskCompletedToCreator({ actorId, task, board }) {
  const creator = String(task?.createdBy || '').trim();
  if (!creator) return false;
  const ctx = boardNotifyContext(board, task);
  const titleText = String(task?.title || 'Thẻ').trim() || 'Thẻ';
  return postBulkNotifications({
    userIds: [creator],
    type: 'task_completed',
    title: 'Việc đã hoàn thành',
    content: `Thẻ “${titleText}” đã chuyển Done.`,
    data: {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      boardId: ctx.boardId,
      taskId: String(task?._id || ''),
      kind: 'task_completed',
    },
    actionUrl: ctx.actionUrl,
    excludeUserId: actorId,
  });
}

module.exports = {
  isConfigured,
  uniqueUserIds,
  projectHubActionUrl,
  postBulkNotifications,
  notifySystemKind,
  notifyTaskAssigned,
  notifyTaskCompletedToCreator,
};
