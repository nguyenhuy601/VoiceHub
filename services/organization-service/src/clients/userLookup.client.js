const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(
  process.env.USER_SERVICE_INTERNAL_TOKEN || ''
).trim();

async function searchUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    return null;
  }
  const response = await axios.get(`${USER_SERVICE_URL}/api/users/internal/search`, {
    params: { q: normalized, limit: 10, page: 1 },
    headers: {
      'x-internal-token': USER_SERVICE_INTERNAL_TOKEN,
    },
    timeout: Number(process.env.USER_LOOKUP_TIMEOUT_MS || 10000),
    validateStatus: () => true,
  });
  if (response.status >= 400) return null;
  const payload = response.data?.data || response.data;
  const users = Array.isArray(payload?.users)
    ? payload.users
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];
  const exact = users.find(
    (u) => String(u.email || '').trim().toLowerCase() === normalized
  );
  if (exact) return exact;
  const userId = users[0]?.userId || users[0]?.id || users[0]?._id;
  return userId ? users[0] : null;
}

module.exports = {
  searchUserByEmail,
};
