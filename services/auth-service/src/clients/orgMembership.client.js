const axios = require('axios');

const ORG_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * @returns {Promise<'system'|'full'|'hr'|null>}
 */
async function resolveCompanyAdminLevel(actor, organizationId) {
  const systemRole = String(actor?.systemRole || '').trim().toLowerCase();
  if (systemRole === 'admin') return 'system';

  const orgId = String(organizationId || '').trim();
  const actorId = String(actor?.id || actor?.userId || actor?._id || '').trim();
  if (!orgId || !actorId || !ORG_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    return null;
  }

  try {
    const response = await axios.get(
      `${ORG_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(orgId)}/${encodeURIComponent(actorId)}`,
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: Number(process.env.ORG_MEMBERSHIP_LOOKUP_MS || 8000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) return null;
    const role = String(response.data?.data?.role || '').trim().toLowerCase();
    if (role === 'owner' || role === 'admin') return 'full';
    if (role === 'hr') return 'hr';
    return null;
  } catch {
    return null;
  }
}

/**
 * User đích có phải thành viên active của tổ chức không (cùng endpoint internal membership).
 * @returns {Promise<true|false|'unavailable'>}
 */
async function isActiveOrgMember(organizationId, userId) {
  const orgId = String(organizationId || '').trim();
  const uid = String(userId || '').trim();
  if (!orgId || !uid || !ORG_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) return 'unavailable';

  try {
    const response = await axios.get(
      `${ORG_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(orgId)}/${encodeURIComponent(uid)}`,
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: Number(process.env.ORG_MEMBERSHIP_LOOKUP_MS || 8000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 200 && response.status < 300) return true;
    if (response.status === 404) return false;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

module.exports = {
  resolveCompanyAdminLevel,
  isActiveOrgMember,
};
