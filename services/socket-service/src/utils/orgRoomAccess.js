function organizationServiceUrl() {
  return String(process.env.ORGANIZATION_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function gatewayInternalToken() {
  return String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
}

function internalHeaders() {
  const token = gatewayInternalToken();
  if (!token) return null;
  return { 'x-gateway-internal-token': token };
}

function defaultHttpGet(...args) {
  // Lazy require — unit tests inject httpGet và không cần axios host.
  const axios = require('axios');
  return axios.get(...args);
}

/**
 * Quyền đọc kênh org cho socket room:join.
 * S2S internal voice-channel-access — cho phép khi data.canRead (không dùng data.allowed = canVoice).
 * @param {object} ctx
 * @param {{ httpGet?: Function }} [deps] — inject httpGet cho unit test
 */
async function assertOrgChannelSocketAccess(
  { userId, organizationId, channelId, authorizationHeader: _authorizationHeader },
  deps = {}
) {
  if (!userId || !organizationId || !channelId) {
    return { allowed: false, reason: 'missing_context' };
  }
  const base = organizationServiceUrl();
  if (!base) {
    return { allowed: false, reason: 'org_service_url_missing' };
  }
  const headers = internalHeaders();
  if (!headers) {
    return { allowed: false, reason: 'gateway_trust_not_configured' };
  }
  const httpGet = typeof deps.httpGet === 'function' ? deps.httpGet : defaultHttpGet;
  try {
    const res = await httpGet(
      `${base}/api/organizations/internal/voice-channel-access/${encodeURIComponent(organizationId)}/${encodeURIComponent(userId)}/${encodeURIComponent(channelId)}`,
      { headers, timeout: 10000, validateStatus: () => true }
    );
    if (res.status !== 200) {
      return { allowed: false, reason: 'upstream_denied' };
    }
    const canRead = Boolean(res.data?.data?.canRead ?? res.data?.canRead);
    return { allowed: canRead, reason: canRead ? null : 'read_denied' };
  } catch {
    return { allowed: false, reason: 'upstream_error' };
  }
}

module.exports = { assertOrgChannelSocketAccess, gatewayInternalToken, internalHeaders };
