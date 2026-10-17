const axios = require('axios');
const { evaluateStoredSystemAdmin } = require('../utils/storedSystemAdmin');

/**
 * Đọc systemRole hiện tại từ auth-service. Lỗi mạng / thiếu cấu hình → unavailable (fail closed).
 * @returns {Promise<{ state: 'admin' | 'denied' | 'unavailable' }>}
 */
async function readStoredSystemAdminState(userId) {
  const uid = String(userId || '').trim();
  const authUrl = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
  const internalToken = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!uid || !authUrl || !internalToken) {
    return { state: 'unavailable' };
  }

  try {
    const response = await axios.post(
      `${authUrl}/api/auth/internal/users-auth-summary`,
      { userIds: [uid] },
      {
        headers: { 'x-gateway-internal-token': internalToken },
        timeout: Number(process.env.AUTH_LOOKUP_TIMEOUT_MS || 8000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) return { state: 'unavailable' };
    const rows = response.data?.data?.profiles || response.data?.profiles || [];
    if (!Array.isArray(rows)) return { state: 'unavailable' };
    const row = rows.find((item) => String(item?.userId || '').trim() === uid) || null;
    return evaluateStoredSystemAdmin(row).allow ? { state: 'admin' } : { state: 'denied' };
  } catch {
    return { state: 'unavailable' };
  }
}

module.exports = {
  readStoredSystemAdminState,
};
