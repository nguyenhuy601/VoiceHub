const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * S2S: department roster (memberIds + head) cho capacity / planner / pool.
 * Degrade → [] nếu org-service lỗi.
 * Không truyền departmentIds → toàn org (elevated callers).
 */
async function fetchDepartmentRoster(organizationId, { departmentIds, actorUserId } = {}) {
  if (!ORGANIZATION_SERVICE_URL || !organizationId) return [];
  try {
    const params = {};
    const ids = (Array.isArray(departmentIds) ? departmentIds : []).map(String).filter(Boolean);
    if (ids.length) params.departmentIds = ids.join(',');
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/departments/roster`,
      {
        params,
        headers: buildTrustedGatewayHeaders(actorUserId || 'system'),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return [];
    const list = res.data?.data?.departments;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function fetchUserPlacement(organizationId, userId, actorUserId) {
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !userId) return null;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/users/${encodeURIComponent(String(userId))}/placement`,
      {
        headers: buildTrustedGatewayHeaders(actorUserId || 'system'),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return null;
    return res.data?.data?.placement || null;
  } catch {
    return null;
  }
}

module.exports = { fetchDepartmentRoster, fetchUserPlacement };
