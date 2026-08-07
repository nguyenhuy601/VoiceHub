const axios = require('axios');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

async function bulkUpdateUserProfileFields(userId, payload) {
  if (!USER_SERVICE_URL || !USER_SERVICE_INTERNAL_TOKEN) {
    throw new Error('USER_SERVICE_URL or USER_SERVICE_INTERNAL_TOKEN not configured');
  }

  const response = await axios.post(`${USER_SERVICE_URL}/api/users/internal/profile/${encodeURIComponent(String(userId))}/bulk-fields`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': USER_SERVICE_INTERNAL_TOKEN,
      },
      timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 20000),
      validateStatus: () => true,
    }
  );

  if (response.status >= 400) {
    const msg = response.data?.message || response.data?.messageUser || 'User profile bulk import failed';
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode;
    throw err;
  }

  return response.data?.data ?? response.data;
}

module.exports = {
  bulkUpdateUserProfileFields,
};

