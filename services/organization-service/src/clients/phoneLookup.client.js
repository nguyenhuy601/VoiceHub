const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

/**
 * Precheck: SĐT nào đã tồn tại trên user-service (đã chuẩn hóa 0xxxxxxxxx).
 * Chỉ nhận { taken: string[] } — không profile.
 * @param {string[]} phones
 * @returns {Promise<string[]>}
 */
async function findTakenPhones(phones) {
  if (!USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    throw new Error('USER_SERVICE_URL or USER_SERVICE_INTERNAL_TOKEN not configured');
  }

  const list = Array.isArray(phones) ? phones.map((p) => String(p || '').trim()).filter(Boolean) : [];
  if (!list.length) return [];

  const response = await axios.post(
    `${USER_SERVICE_URL}/api/users/internal/phones/taken`,
    { phones: list },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': USER_SERVICE_INTERNAL_TOKEN,
      },
      timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 15000),
      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    const msg = response.data?.message || 'phone lookup failed';
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode || 'PHONE_LOOKUP_FAILED';
    throw err;
  }

  const taken = response.data?.data?.taken ?? response.data?.taken ?? [];
  return Array.isArray(taken) ? taken.map((p) => String(p).trim()).filter(Boolean) : [];
}

module.exports = {
  findTakenPhones,
};
