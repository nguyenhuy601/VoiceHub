const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const { SummaryError } = require('./summaryErrors');
const { isObjectIdString } = require('./summaryInput');

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

  if (!uid) throw new SummaryError('SUMMARY_USER_CONTEXT_MISSING');
  if (!isObjectIdString(oid) || !isObjectIdString(rid)) {
    throw new SummaryError('SUMMARY_BAD_REQUEST');
  }
  if (!ORGANIZATION_SERVICE_URL) throw new SummaryError('SUMMARY_VERIFY_UNAVAILABLE');

  let res;
  try {
    res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(oid)}/accessible-channel-ids`,
      {
        headers: buildTrustedGatewayHeaders(uid),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    throw new SummaryError('SUMMARY_VERIFY_UNAVAILABLE', { cause: err });
  }

  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new SummaryError('SUMMARY_FORBIDDEN');
  }
  if (res.status !== 200) throw new SummaryError('SUMMARY_VERIFY_UNAVAILABLE');

  const channelIds = res.data?.data?.channelIds || res.data?.channelIds || [];
  const allowed = new Set((Array.isArray(channelIds) ? channelIds : []).map(String));
  if (!allowed.has(rid)) throw new SummaryError('SUMMARY_FORBIDDEN');

  return { organizationId: oid, roomId: rid, userId: uid };
}

async function fetchOrgThreadExport({ organizationId, roomId, userId, options = {} }) {
  if (!CHAT_SERVICE_URL || !CHAT_INTERNAL_TOKEN) {
    throw new SummaryError('SUMMARY_EXPORT_FAILED');
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

  let res;
  try {
    res = await axios.get(`${CHAT_SERVICE_URL}/api/messages/internal/threads/org-export`, {
      headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
      params,
      timeout: 30000,
      validateStatus: () => true,
    });
  } catch (err) {
    throw new SummaryError('SUMMARY_EXPORT_FAILED', { cause: err });
  }

  if (res.status !== 200 || !res.data?.success) throw new SummaryError('SUMMARY_EXPORT_FAILED');
  return res.data.data;
}

module.exports = {
  buildThreadKey,
  assertOrgChannelAccess,
  fetchOrgThreadExport,
};
