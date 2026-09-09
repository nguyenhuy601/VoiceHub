/**
 * Resolve project channel id from organization-service (S2S).
 */
const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

async function resolveProjectChannelId({ organizationId, projectId, kind = 'announcement' } = {}) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  const channelKind = String(kind || 'announcement').trim() || 'announcement';
  if (!ORGANIZATION_SERVICE_URL || !orgId || !pid) return null;
  try {
    const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/project-channel/${encodeURIComponent(orgId)}/${encodeURIComponent(pid)}`;
    const res = await axios.get(url, {
      params: { kind: channelKind },
      headers: buildTrustedGatewayHeaders(''),
      timeout: Number(process.env.ORG_PROJECT_CHANNEL_LOOKUP_MS || 10000),
      validateStatus: () => true,
    });
    if (res.status >= 400) return null;
    const data = res.data?.data ?? res.data;
    const channelId = String(data?.channelId || '').trim();
    return channelId || null;
  } catch {
    return null;
  }
}

module.exports = {
  resolveProjectChannelId,
};
