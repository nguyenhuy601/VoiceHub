/**
 * S2S checkPermission (master key V2) — role-permission-service.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');

const ROLE_PERMISSION_BASE = String(process.env.ROLE_PERMISSION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

async function checkMasterGrant(userId, organizationId, action) {
  if (!ROLE_PERMISSION_BASE || !GATEWAY_INTERNAL_TOKEN || !userId || !organizationId || !action) {
    return false;
  }
  try {
    const res = await axios.post(
      `${ROLE_PERMISSION_BASE}/api/permissions/check`,
      {
        userId: String(userId),
        serverId: String(organizationId),
        action: String(action),
      },
      { headers: headers(), timeout: 5000, validateStatus: () => true }
    );
    return res.status === 200 && res.data?.success === true && res.data?.data?.allowed === true;
  } catch (error) {
    logger.warn('[rbacPermission] checkMasterGrant failed', error.message);
    return false;
  }
}

module.exports = { checkMasterGrant };
