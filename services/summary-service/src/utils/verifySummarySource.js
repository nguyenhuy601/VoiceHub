const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

function buildThreadKey(organizationId, roomId) {
  return `org:${String(organizationId)}:${String(roomId)}`;
}

async function assertOrgChannelAccess({ organizationId, roomId, userId }) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  const rid = String(roomId || '').trim();

  if (!uid || !oid || !rid) {
    const err = new Error('Missing organizationId, roomId or user context');
    err.statusCode = 400;
    throw err;
  }
  if (!/^[a-f0-9]{24}$/i.test(oid) || !/^[a-f0-9]{24}$/i.test(rid)) {
    const err = new Error('Invalid organizationId or roomId');
    err.statusCode = 400;
    throw err;
  }

  if (!ORGANIZATION_SERVICE_URL) {
    const err = new Error('Organization service is not configured');
    err.statusCode = 503;
    throw err;
  }

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
    err.errorCode = 'SUMMARY_FORBIDDEN';
    throw err;
  }
  if (res.status !== 200) {
    const err = new Error('Cannot verify channel access');
    err.statusCode = 403;
    err.errorCode = 'SUMMARY_FORBIDDEN';
    throw err;
  }

  const channelIds = res.data?.data?.channelIds || res.data?.channelIds || [];
  const allowed = new Set((Array.isArray(channelIds) ? channelIds : []).map(String));
  if (!allowed.has(rid)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    err.errorCode = 'SUMMARY_FORBIDDEN';
    throw err;
  }

  return { organizationId: oid, roomId: rid, userId: uid };
}

async function fetchOrgThreadExport({ organizationId, roomId, userId, options = {} }) {
  if (!CHAT_SERVICE_URL || !CHAT_INTERNAL_TOKEN) {
    const err = new Error('Chat internal API is not configured');
    err.statusCode = 503;
    throw err;
  }

  const params = {
    organizationId,
    roomId,
    userId,
    limit: options.maxMessages,
    unreadOnly: options.unreadOnly ? '1' : undefined,
    readerId: options.unreadOnly ? userId : undefined,
    sinceMessageId: options.sinceMessageId || undefined,
  };

  const res = await axios.get(`${CHAT_SERVICE_URL}/api/messages/internal/threads/org-export`, {
    headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
    params,
    timeout: 30000,
    validateStatus: () => true,
  });

  if (res.status !== 200 || !res.data?.success) {
    const err = new Error('Cannot export org thread');
    err.statusCode = 502;
    throw err;
  }

  return res.data.data;
}

module.exports = {
  buildThreadKey,
  assertOrgChannelAccess,
  fetchOrgThreadExport,
};
