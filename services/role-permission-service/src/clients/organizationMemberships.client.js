const axios = require('axios');
const { logger } = require('@enterprise/shared');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(GATEWAY_INTERNAL_TOKEN ? { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN } : {}),
  };
}

/**
 * Fetch active org memberships for RBAC UserRole rebind.
 * @returns {Promise<Array<{ userId: string, role: string }>>}
 */
async function fetchOrganizationMemberships(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) return [];
  if (!ORGANIZATION_SERVICE_URL) {
    logger.warn('[rbac] ORGANIZATION_SERVICE_URL missing — cannot list memberships');
    return [];
  }
  if (!GATEWAY_INTERNAL_TOKEN) {
    logger.warn('[rbac] GATEWAY_INTERNAL_TOKEN missing — cannot list memberships');
    return [];
  }

  const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/memberships/${encodeURIComponent(oid)}`;
  try {
    const res = await axios.get(url, {
      headers: internalHeaders(),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      logger.warn('[rbac] fetchOrganizationMemberships failed', {
        organizationId: oid,
        status: res.status,
        message: res.data?.message,
      });
      return [];
    }
    const data = res.data?.data;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    logger.warn('[rbac] fetchOrganizationMemberships error', err.message);
    return [];
  }
}

module.exports = {
  fetchOrganizationMemberships,
};
