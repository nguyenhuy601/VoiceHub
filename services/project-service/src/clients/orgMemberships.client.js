const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * S2S: active org memberships — SoT for org-wide resource pool.
 * @returns {Promise<Array<{ userId: string, role: string }>>}
 */
async function fetchOrganizationMemberships(organizationId, actorUserId = 'system') {
  const oid = String(organizationId || '').trim();
  if (!oid || !ORGANIZATION_SERVICE_URL) return [];
  try {
    const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/memberships/${encodeURIComponent(oid)}`;
    const res = await axios.get(url, {
      headers: buildTrustedGatewayHeaders(actorUserId || 'system'),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status !== 200) return [];
    const data = res.data?.data;
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => ({
        userId: String(row?.userId || row?.user || '').trim(),
        role: String(row?.role || '').trim().toLowerCase(),
      }))
      .filter((row) => row.userId);
  } catch {
    return [];
  }
}

module.exports = {
  fetchOrganizationMemberships,
};
