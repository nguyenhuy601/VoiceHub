const axios = require('axios');
const { logger } = require('@enterprise/shared');

const ORG_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function resolveActorId(actor) {
  return String(actor?.id || actor?.userId || actor?._id || '').trim();
}

function isSystemAdminActor(actor) {
  return String(actor?.systemRole || actor?.role || '').trim().toLowerCase() === 'admin';
}

/**
 * Fail-closed: lỗi mạng / org-service lỗi → null (coi như không phải member).
 * @returns {Promise<string|null>} role membership đang active, hoặc null
 */
async function fetchMembershipRole(organizationId, actorId) {
  const orgId = String(organizationId || '').trim();
  const uid = String(actorId || '').trim();
  if (!orgId || !uid || !ORG_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) return null;

  try {
    const response = await axios.get(
      `${ORG_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(orgId)}/${encodeURIComponent(uid)}`,
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: Number(process.env.ORG_MEMBERSHIP_LOOKUP_MS || 8000),
        validateStatus: () => true,
      }
    );
    if (response.status === 404) return null;
    if (response.status >= 400) {
      logger.warn('[meeting] membership lookup failed', { organizationId: orgId, status: response.status });
      return null;
    }
    return String(response.data?.data?.role || 'member').trim().toLowerCase();
  } catch (err) {
    logger.warn('[meeting] membership lookup failed', { organizationId: orgId, reason: err?.code || err?.message });
    return null;
  }
}

/**
 * @returns {Promise<'system'|'full'|'hr'|null>}
 */
async function resolveCompanyAdminLevel(actor, organizationId) {
  if (isSystemAdminActor(actor)) return 'system';
  const role = await fetchMembershipRole(organizationId, resolveActorId(actor));
  if (role === 'owner' || role === 'admin') return 'full';
  if (role === 'hr') return 'hr';
  return null;
}

async function isOrgMember(actor, organizationId) {
  const role = await fetchMembershipRole(organizationId, resolveActorId(actor));
  return Boolean(role);
}

async function isOrgMeetingAdmin(actor, meeting) {
  const orgId = String(meeting?.organizationId || meeting?.serverId || '').trim();
  if (!orgId) return false;
  const level = await resolveCompanyAdminLevel(actor, orgId);
  return level === 'system' || level === 'full';
}

module.exports = {
  isSystemAdminActor,
  resolveCompanyAdminLevel,
  isOrgMember,
  isOrgMeetingAdmin,
};
