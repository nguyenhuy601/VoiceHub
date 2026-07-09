const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * S2S fallback khi Redis miss — đọc tokenVersion từ Mongo qua auth-service.
 * @returns {Promise<number|null>}
 */
async function fetchTokenVersionFromAuth(userId) {
  if (!AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) return null;
  const uid = String(userId || '').trim();
  if (!uid) return null;

  try {
    const response = await axios.get(
      `${AUTH_SERVICE_URL}/api/auth/internal/token-version/${encodeURIComponent(uid)}`,
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: Number(process.env.GATEWAY_TOKEN_VERSION_TIMEOUT_MS || 5000),
        validateStatus: (s) => s >= 200 && s < 500,
      }
    );
    if (response.status !== 200) return null;
    const raw =
      response.data?.data?.tokenVersion ??
      response.data?.tokenVersion ??
      response.data?.data?.tv;
    if (raw === null || raw === undefined) return null;
    const version = Number(raw);
    return Number.isNaN(version) ? null : version;
  } catch {
    return null;
  }
}

module.exports = {
  fetchTokenVersionFromAuth,
};
