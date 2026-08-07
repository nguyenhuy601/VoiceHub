const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

async function sendCompanyInviteEmail({ email, inviteUrl, organizationName, firstName, lastName }) {
  if (!AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    throw Object.assign(new Error('AUTH_SERVICE_URL or GATEWAY_INTERNAL_TOKEN not configured'), {
      statusCode: 503,
      errorCode: 'ORG_EMAIL_CONFIG',
    });
  }
  const response = await axios.post(
    `${AUTH_SERVICE_URL}/api/auth/internal/company-invite-email`,
    {
      email,
      inviteUrl,
      organizationName,
      firstName,
      lastName,
    },
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
      response.data?.messageUser ||
      response.data?.message ||
      `Invite email failed (${response.status})`;
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode || 'ORG_INVITE_EMAIL_FAILED';
    throw err;
  }
  return response.data?.data || response.data;
}

/**
 * Gửi email đặt mật khẩu sau Excel provision.
 * Caller nên fail-soft (không hủy cả batch nếu SMTP lỗi).
 */
async function sendProvisionSetPasswordEmail({
  userId,
  frontendUrl,
  organizationName,
  firstName,
  lastName,
}) {
  if (!AUTH_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    return { emailScheduled: false, resetUrl: null, skipped: true };
  }
  const response = await axios.post(
    `${AUTH_SERVICE_URL}/api/auth/internal/provision-set-password-email`,
    {
      userId,
      frontendUrl,
      organizationName,
      firstName,
      lastName,
    },
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
      response.data?.messageUser ||
      response.data?.message ||
      `Set-password email failed (${response.status})`;
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode || 'ORG_SET_PASSWORD_EMAIL_FAILED';
    throw err;
  }
  return response.data?.data || response.data || { emailScheduled: false };
}

module.exports = { sendCompanyInviteEmail, sendProvisionSetPasswordEmail };
