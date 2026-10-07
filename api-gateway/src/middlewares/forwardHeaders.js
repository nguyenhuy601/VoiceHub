const { stripClientSuppliedInternalHeaders } = require('../config/services');

const CLIENT_IP_HEADERS = ['x-forwarded-for', 'x-real-ip'];
const IDENTITY_HEADERS = [
  'x-organization-id',
  'x-server-id',
  'x-gateway-internal-token',
  'x-user-id',
  'x-user-email',
  'x-user-system-role',
];

function isTrustProxyEnabled() {
  return process.env.TRUST_PROXY === '1';
}

/**
 * Không có reverse proxy tin cậy phía trước (gọi thẳng :3000) → XFF / X-Real-IP do client tự đặt.
 * Xóa trước rate-limit và trước proxy (`xfwd` sẽ gắn IP socket thật cho downstream).
 * Có TRUST_PROXY=1 (Nginx voicehub.local) → Nginx sở hữu các header này, giữ nguyên.
 */
function stripSpoofedForwardHeaders(req, res, next) {
  if (!isTrustProxyEnabled()) {
    for (const name of CLIENT_IP_HEADERS) {
      delete req.headers[name];
    }
  }
  next();
}

/**
 * Xóa mọi header identity/trust client gửi lên rồi gắn lại chỉ từ JWT đã verify (`req.user`).
 */
function applyTrustedIdentityHeaders(req) {
  for (const name of IDENTITY_HEADERS) {
    delete req.headers[name];
  }
  stripClientSuppliedInternalHeaders(req.headers);

  const gatewayToken = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (gatewayToken) {
    req.headers['x-gateway-internal-token'] = gatewayToken;
  }
  if (req.user) {
    req.headers['x-user-id'] = req.user.id;
    if (req.user.email) {
      req.headers['x-user-email'] = req.user.email;
    }
    if (req.user.systemRole) {
      req.headers['x-user-system-role'] = req.user.systemRole;
    }
  }
}

module.exports = {
  stripSpoofedForwardHeaders,
  applyTrustedIdentityHeaders,
};
