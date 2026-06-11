const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

async function fetchMessageById(messageId) {
  if (!CHAT_SERVICE_URL || !CHAT_INTERNAL_TOKEN) {
    const err = new Error('Chat internal API is not configured');
    err.statusCode = 503;
    throw err;
  }
  const res = await axios.get(
    `${CHAT_SERVICE_URL}/api/messages/internal/messages/${encodeURIComponent(String(messageId))}`,
    {
      headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  if (res.status === 404) return null;
  if (res.status !== 200 || !res.data?.data) {
    const err = new Error('Cannot load source message');
    err.statusCode = 400;
    throw err;
  }
  return res.data.data;
}

async function assertUserCanExtractFromMessage({ messageId, organizationId, userId, channelId }) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  const msg = await fetchMessageById(messageId);
  if (!msg) {
    const err = new Error('Message not found');
    err.statusCode = 404;
    throw err;
  }

  const msgOrg = msg.organizationId ? String(msg.organizationId) : '';
  if (msgOrg && msgOrg !== oid) {
    const err = new Error('organizationId does not match message');
    err.statusCode = 403;
    throw err;
  }

  const sender = String(msg.senderId?._id || msg.senderId || '');
  const receiver = String(msg.receiverId?._id || msg.receiverId || '');
  if (sender === uid || receiver === uid) {
    return msg;
  }

  if (msg.roomId && ORGANIZATION_SERVICE_URL) {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(oid)}/accessible-channel-ids`,
      {
        headers: buildTrustedGatewayHeaders(uid),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status === 403 || res.status === 401) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    const channelIds = res.data?.data?.channelIds || res.data?.channelIds || [];
    const allowed = new Set((Array.isArray(channelIds) ? channelIds : []).map(String));
    const roomId = String(channelId || msg.roomId || '');
    if (roomId && allowed.has(roomId)) {
      return msg;
    }
  }

  const err = new Error('Forbidden');
  err.statusCode = 403;
  throw err;
}

module.exports = {
  assertUserCanExtractFromMessage,
  fetchMessageById,
};
