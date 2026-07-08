const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

async function provisionUserByAdmin(payload) {
  if (!AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    throw new Error('AUTH_SERVICE_URL or GATEWAY_INTERNAL_TOKEN not configured');
  }
  const response = await axios.post(
    `${AUTH_SERVICE_URL}/api/auth/internal/provision`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
      },
      timeout: Number(process.env.AUTH_PROVISION_TIMEOUT_MS || 20000),
      validateStatus: () => true,
    }
  );
  if (response.status >= 400) {
    const msg =
      response.data?.message ||
      response.data?.messageUser ||
      `Auth provision failed (${response.status})`;
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode;
    throw err;
  }
  return response.data?.data || response.data;
}

module.exports = {
  provisionUserByAdmin,
};
