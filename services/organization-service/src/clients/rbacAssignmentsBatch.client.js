const axios = require('axios');

const ROLE_PERMISSION_BASE = String(process.env.ROLE_PERMISSION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * Bulk RBAC assignments theo org/server — S2S internal.
 * @param {string} organizationId
 * @returns {Promise<Map<string, object[]>>}
 */
async function fetchRbacAssignmentsByOrg(organizationId) {
  const oid = String(organizationId || '').trim();
  const map = new Map();
  if (!oid || !ROLE_PERMISSION_BASE || !GATEWAY_INTERNAL_TOKEN) return map;

  try {
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/internal/roles/server/${encodeURIComponent(oid)}/assignments`,
      {
        headers: {
          'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.RBAC_ASSIGNMENTS_BATCH_TIMEOUT_MS || 12000),
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) return map;
    const byUser = res.data?.data?.byUser || res.data?.byUser || {};
    if (!byUser || typeof byUser !== 'object') return map;
    for (const [uid, roles] of Object.entries(byUser)) {
      const id = String(uid || '').trim();
      if (id) map.set(id, Array.isArray(roles) ? roles : []);
    }
  } catch {
    // best-effort
  }
  return map;
}

module.exports = {
  fetchRbacAssignmentsByOrg,
};
