const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Kiểm tra user có quyền truy cập org (membership hoặc RBAC) qua organization-service.
 */
async function assertOrganizationMember(userId, organizationId) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!uid || !oid) {
    const err = new Error('organizationId and userId are required');
    err.statusCode = 400;
    throw err;
  }
  if (!ORGANIZATION_SERVICE_URL) {
    const err = new Error('ORGANIZATION_SERVICE_URL is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(oid)}/accessible-channel-ids`;
  const res = await axios.get(url, {
    headers: buildTrustedGatewayHeaders(uid),
    timeout: Number(process.env.ORG_ACCESS_TIMEOUT_MS || 12000),
    validateStatus: () => true,
  });

  if (res.status === 403 || res.status === 401) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  if (res.status >= 400) {
    const err = new Error(res.data?.message || 'Organization access check failed');
    err.statusCode = res.status >= 500 ? 503 : 400;
    throw err;
  }
  return true;
}

module.exports = { assertOrganizationMember };
