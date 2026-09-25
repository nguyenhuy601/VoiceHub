/**
 * Gửi inbox kết bạn qua notification-service (HTTP nội bộ).
 * Hàm build tách riêng để test payload không cần mạng.
 */
const axios = require('axios');
const logger = require('@enterprise/shared/utils/logger');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isConfigured() {
  return Boolean(NOTIFICATION_SERVICE_URL && NOTIFICATION_INTERNAL_TOKEN);
}

function buildFriendRequestSentNotification({ recipientId, requesterId, requesterName }) {
  const userId = String(recipientId || '').trim();
  if (!userId) return null;
  const name = String(requesterName || '').trim() || 'Someone';
  return {
    userIds: [userId],
    type: 'friend_request',
    title: 'New Friend Request',
    content: `${name} sent you a friend request`,
    data: { userId: String(requesterId || ''), userName: name },
    actionUrl: '/friends/requests',
  };
}

function buildFriendRequestAcceptedNotification({ recipientId, counterpartId, counterpartName }) {
  const userId = String(recipientId || '').trim();
  const peerId = String(counterpartId || '').trim();
  if (!userId || !peerId) return null;
  const name = String(counterpartName || '').trim() || 'Someone';
  return {
    userIds: [userId],
    type: 'friend_accepted',
    title: 'Friend Request Accepted',
    content: `${name} has accepted your friend request`,
    data: { friendId: peerId, friendName: name },
    actionUrl: `/friends/${peerId}`,
  };
}

/** Không bao giờ throw — notification là side-effect phụ của luồng kết bạn. */
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
      logger.warn(`[notification.client] bulk HTTP ${res.status} type=${payload.type}`);
    }
    return ok;
  } catch (err) {
    logger.warn(`[notification.client] bulk failed: ${err?.message || err}`);
    return false;
  }
}

async function notifyFriendRequestSent({ recipientId, requesterId, requesterName }) {
  return postNotification(
    buildFriendRequestSentNotification({ recipientId, requesterId, requesterName })
  );
}

async function notifyFriendRequestAccepted({ recipientId, counterpartId, counterpartName }) {
  return postNotification(
    buildFriendRequestAcceptedNotification({ recipientId, counterpartId, counterpartName })
  );
}

module.exports = {
  isConfigured,
  buildFriendRequestSentNotification,
  buildFriendRequestAcceptedNotification,
  notifyFriendRequestSent,
  notifyFriendRequestAccepted,
};
