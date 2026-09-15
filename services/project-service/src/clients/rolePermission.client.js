const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

const PROJECT_CREATE_GRANT = 'project.project.create';

function requireGrantEnabled() {
  const raw = String(process.env.CREATE_PROJECT_REQUIRE_GRANT ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * S2S: check master/legacy action via RPS.
 * @returns {Promise<boolean>}
 */
async function checkPermission({ userId, organizationId, action }) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  const act = String(action || '').trim();
  if (!uid || !oid || !act || !ROLE_PERMISSION_SERVICE_URL) return false;
  try {
    const res = await axios.post(
      `${ROLE_PERMISSION_SERVICE_URL}/api/permissions/check`,
      { userId: uid, serverId: oid, action: act },
      {
        headers: buildTrustedGatewayHeaders(uid),
        timeout: 5000,
        validateStatus: () => true,
      }
    );
    return Boolean(res.status === 200 && res.data?.success && res.data?.data?.allowed === true);
  } catch {
    return false;
  }
}

async function hasProjectCreateGrant(userId, organizationId) {
  return checkPermission({
    userId,
    organizationId,
    action: PROJECT_CREATE_GRANT,
  });
}

/**
 * Idempotent migration — bind pack containing project.project.create.
 * @returns {Promise<{ ok: boolean, migrated?: boolean, errorCode?: string }>}
 */
async function ensureProjectCreateGrant(userId, organizationId, actorUserId) {
  const uid = String(userId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!uid || !oid || !ROLE_PERMISSION_SERVICE_URL) {
    return { ok: false, errorCode: 'MIGRATION_BIND_FAILED' };
  }
  try {
    const res = await axios.post(
      `${ROLE_PERMISSION_SERVICE_URL}/api/permissions/internal/ensure-project-create-grant`,
      { userId: uid, organizationId: oid },
      {
        headers: buildTrustedGatewayHeaders(actorUserId || uid),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 200 && res.status < 300 && res.data?.success) {
      return { ok: true, migrated: Boolean(res.data?.data?.migrated), ...(res.data?.data || {}) };
    }
    return {
      ok: false,
      errorCode: res.data?.errorCode || 'MIGRATION_BIND_FAILED',
    };
  } catch {
    return { ok: false, errorCode: 'MIGRATION_BIND_FAILED' };
  }
}

module.exports = {
  PROJECT_CREATE_GRANT,
  requireGrantEnabled,
  checkPermission,
  hasProjectCreateGrant,
  ensureProjectCreateGrant,
};
