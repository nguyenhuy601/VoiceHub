const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * @param {string[]} userIds
 * @returns {Promise<Map<string, object>>}
 */
async function fetchAuthSummaryByUserIds(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!ids.length || !AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    return map;
  }
  try {
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/auth/internal/users-auth-summary`,
      { userIds: ids },
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: Number(process.env.AUTH_LOOKUP_TIMEOUT_MS || 10000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) return map;
    const rows = response.data?.data?.profiles || response.data?.profiles || [];
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
      const uid = String(row.userId || '').trim();
      if (uid) map.set(uid, row);
    }
  } catch {
    // best-effort
  }
  return map;
}

module.exports = {
  fetchAuthSummaryByUserIds,
};
