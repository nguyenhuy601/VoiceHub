const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Owner/admin active của org — đối tượng nhận thông báo document workspace.
 * @returns {Promise<string[]>}
 */
async function fetchOrganizationAdminUserIds(organizationId, actorUserId = 'system') {
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
      .filter((row) => {
        const role = String(row?.role || '').trim().toLowerCase();
        return role === 'owner' || role === 'admin';
      })
      .map((row) => String(row?.userId || row?.user || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = {
  fetchOrganizationAdminUserIds,
};
