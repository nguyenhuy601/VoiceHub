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
 * Effective org grants from Position → Org Role → Permission+Scope (organization-service).
 * @returns {Promise<{ grantScopes: Record<string, string> }>}
 */
async function fetchEffectiveOrgGrants(organizationId, userId) {
  const oid = String(organizationId || '').trim();
  const uid = String(userId || '').trim();
  if (!oid || !uid) return { grantScopes: {} };
  if (!ORGANIZATION_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    logger.warn('[rbac] orgRbacClient missing ORGANIZATION_SERVICE_URL or GATEWAY_INTERNAL_TOKEN');
    return { grantScopes: {} };
  }

  const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(oid)}/users/${encodeURIComponent(uid)}/effective-grants`;
  try {
    const res = await axios.get(url, {
      headers: internalHeaders(),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      logger.warn('[rbac] fetchEffectiveOrgGrants failed', {
        organizationId: oid,
        userId: uid,
        status: res.status,
        message: res.data?.message,
      });
      return { grantScopes: {} };
    }
    const data = res.data?.data || {};
    const grantScopes =
      data.grantScopes && typeof data.grantScopes === 'object' ? data.grantScopes : {};
    return { grantScopes };
  } catch (err) {
    logger.warn('[rbac] fetchEffectiveOrgGrants error', err.message);
    return { grantScopes: {} };
  }
}

module.exports = {
  fetchEffectiveOrgGrants,
};
