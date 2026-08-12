const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(
  process.env.USER_SERVICE_INTERNAL_TOKEN || process.env.GATEWAY_INTERNAL_TOKEN || ''
).trim();

/**
 * @param {string[]} userIds
 * @returns {Promise<Map<string, object>>}
 */
async function fetchProfilesByUserIds(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!ids.length || !USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    return map;
  }
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/internal/profiles/batch`,
      { userIds: ids },
      {
        headers: {
          'x-internal-token': USER_SERVICE_INTERNAL_TOKEN,
          'x-gateway-internal-token': USER_SERVICE_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.USER_LOOKUP_TIMEOUT_MS || 10000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) return map;
    const rows = response.data?.data?.profiles || response.data?.profiles || [];
    if (!Array.isArray(rows)) return map;
    for (const row of rows) {
      const uid = String(row.userId || row.id || row._id || '').trim();
      if (uid) map.set(uid, row);
    }
  } catch {
    // best-effort enrich
  }
  return map;
}

module.exports = {
  fetchProfilesByUserIds,
};
