const axios = require('axios');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');

const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function internalHeaders() {
  const headers = {};
  if (GATEWAY_INTERNAL_TOKEN) {
    headers['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  }
  return headers;
}

async function assertOrgVoiceChannelAccess({
  userId,
  organizationId,
  channelId,
  authorizationHeader: _authorizationHeader,
}) {
  if (!userId || !organizationId || !channelId) {
    return { allowed: false, reason: 'missing_context' };
  }
  if (!GATEWAY_INTERNAL_TOKEN) {
    return { allowed: false, reason: 'gateway_trust_not_configured' };
  }
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/voice-channel-access/${encodeURIComponent(organizationId)}/${encodeURIComponent(userId)}/${encodeURIComponent(channelId)}`,
      { headers: internalHeaders(), timeout: 10000, validateStatus: () => true }
    );
    if (res.status !== 200) {
      return { allowed: false, reason: 'upstream_denied' };
    }
    const allowed = Boolean(res.data?.data?.allowed ?? res.data?.allowed);
    return { allowed, reason: allowed ? null : res.data?.data?.reason || 'voice_denied' };
  } catch {
    return { allowed: false, reason: 'upstream_error' };
  }
}

module.exports = { assertOrgVoiceChannelAccess };
