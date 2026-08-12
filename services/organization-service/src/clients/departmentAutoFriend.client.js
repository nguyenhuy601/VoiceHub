const axios = require('axios');
const { logger } = require('@enterprise/shared');

const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * S2S: kết bạn accepted với peers (bỏ lời mời).
 * Không throw — caller không được fail placement sync vì friend.
 */
async function ensureAcceptedWithPeers(userId, peerUserIds, { source = 'department' } = {}) {
  const uid = String(userId || '').trim();
  const peers = Array.isArray(peerUserIds)
    ? peerUserIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!uid || !peers.length) {
    return { skipped: true, reason: 'empty' };
  }
  if (!FRIEND_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    logger.warn('[departmentAutoFriend] FRIEND_SERVICE_URL or GATEWAY_INTERNAL_TOKEN missing — skip');
    return { skipped: true, reason: 'not_configured' };
  }

  try {
    const response = await axios.post(
      `${FRIEND_SERVICE_URL}/api/friends/internal/ensure-accepted`,
      { userId: uid, peerUserIds: peers, source },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.DEPARTMENT_AUTO_FRIEND_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) {
      logger.warn('[departmentAutoFriend] friend-service error', {
        status: response.status,
        message: response.data?.message,
        userId: uid,
        peerCount: peers.length,
      });
      return { ok: false, status: response.status, data: response.data };
    }
    return { ok: true, data: response.data?.data || response.data };
  } catch (error) {
    logger.warn('[departmentAutoFriend] request failed:', error.message);
    return { ok: false, reason: error.message };
  }
}

module.exports = {
  ensureAcceptedWithPeers,
};
