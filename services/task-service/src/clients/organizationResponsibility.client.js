const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * S2S: lấy userIds có Responsibility key trong org.
 * Degrade → [] nếu org-service lỗi / thiếu env.
 */
async function fetchUserIdsByResponsibilityKey(organizationId, responsibilityKey, actorUserId) {
  const key = String(responsibilityKey || '').trim();
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !key) return [];
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/responsibilities/users`,
      {
        params: { key },
        headers: buildTrustedGatewayHeaders(actorUserId || 'system'),
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return [];
    const ids = res.data?.data?.userIds;
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

module.exports = { fetchUserIdsByResponsibilityKey };
