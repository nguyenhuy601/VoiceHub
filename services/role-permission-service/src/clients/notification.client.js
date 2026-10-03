/**
 * Gửi inbox thay đổi role qua notification-service (HTTP nội bộ).
 * Hàm build tách riêng để test payload không cần mạng.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isConfigured() {
  return Boolean(NOTIFICATION_SERVICE_URL && NOTIFICATION_INTERNAL_TOKEN);
}

function buildRoleRemovedNotification({
  userId,
  roleName,
  serverId,
  serverName,
  removedBy,
  organizationId,
}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const role = String(roleName || '').trim() || 'Role';
  const server = String(serverName || '').trim() || 'Server';
  const sid = String(serverId || '').trim();
  return {
    userIds: [uid],
    type: 'system',
    title: 'Role Removed',
    content: `The role '${role}' has been removed from you in ${server}`,
    data: {
      roleName: role,
      serverId: sid,
      serverName: server,
      removedBy: removedBy ? String(removedBy) : null,
      organizationId: organizationId ? String(organizationId) : null,
    },
    actionUrl: `/servers/${sid}/roles`,
  };
}

/** Không bao giờ throw — notification là side-effect phụ của luồng gỡ role. */
async function postNotification(payload) {
  if (!payload || !isConfigured()) return false;
  try {
    const res = await axios.post(`${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`, payload, {
      headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
      timeout: 8000,
      validateStatus: () => true,
    });
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      logger.warn('[notification.client] bulk HTTP %s type=%s', res.status, payload.type);
    }
    return ok;
  } catch (err) {
    logger.warn('[notification.client] bulk failed: %s', err?.message || err);
    return false;
  }
}

async function notifyRoleRemoved(args) {
  return postNotification(buildRoleRemovedNotification(args));
}

module.exports = {
  isConfigured,
  buildRoleRemovedNotification,
  notifyRoleRemoved,
};
