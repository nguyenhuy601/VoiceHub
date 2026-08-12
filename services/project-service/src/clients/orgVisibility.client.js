const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const {
  normalizeProjectVisibilityPolicy,
} = require('@enterprise/shared/config/projectVisibilityPolicy');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * S2S: org visibility policy + actor department/roles for discover resolve.
 */
async function fetchProjectVisibilityContext(organizationId, userId) {
  const empty = {
    isOrgMember: false,
    membershipRole: null,
    organizationRoleKeys: [],
    headedDepartmentIds: [],
    memberDepartmentIds: [],
    policy: normalizeProjectVisibilityPolicy({}),
    userId: String(userId || ''),
  };
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !userId) return empty;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(
        String(organizationId)
      )}/users/${encodeURIComponent(String(userId))}/project-visibility-context`,
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return empty;
    const data = res.data?.data ?? res.data ?? {};
    return {
      isOrgMember: Boolean(data.isOrgMember),
      membershipRole: data.membershipRole || null,
      organizationRoleKeys: Array.isArray(data.organizationRoleKeys) ? data.organizationRoleKeys : [],
      headedDepartmentIds: Array.isArray(data.headedDepartmentIds) ? data.headedDepartmentIds.map(String) : [],
      memberDepartmentIds: Array.isArray(data.memberDepartmentIds) ? data.memberDepartmentIds.map(String) : [],
      policy: normalizeProjectVisibilityPolicy(data.policy || {}),
      userId: String(userId),
    };
  } catch {
    return empty;
  }
}

module.exports = { fetchProjectVisibilityContext };
