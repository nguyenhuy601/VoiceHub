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
 * @returns {'ok'|'forbidden'|'unavailable'}
 */
async function assertActiveOrgMembership(userId, organizationId) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!uid || !oid) return 'forbidden';

  if (!ORGANIZATION_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    logger.warn('[notification] org membership lookup unavailable — missing env', {
      hasOrgUrl: Boolean(ORGANIZATION_SERVICE_URL),
      hasGatewayToken: Boolean(GATEWAY_INTERNAL_TOKEN),
    });
    return 'unavailable';
  }

  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(oid)}/${encodeURIComponent(uid)}`,
      { headers: internalHeaders(), timeout: 8000, validateStatus: () => true }
    );
    if (res.status === 200 && res.data?.data?.role) {
      return 'ok';
    }
    if (res.status === 404 || res.status === 403) {
      return 'forbidden';
    }
    logger.warn('[notification] membership lookup unexpected status', {
      organizationId: oid,
      status: res.status,
    });
    return 'unavailable';
  } catch (err) {
    logger.warn('[notification] membership lookup failed', err.message);
    return 'unavailable';
  }
}

module.exports = {
  assertActiveOrgMembership,
};
