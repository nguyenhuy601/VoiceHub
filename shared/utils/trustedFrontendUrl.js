const { resolveFrontendUrl } = require('./resolveFrontendUrl');

const LAN_DEV_ORIGIN = 'https://voicehub.local';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function toOrigin(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function listCorsOrigins(env) {
  return String(env.CORS_ORIGIN || '')
    .split(',')
    .map(toOrigin)
    .filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (origin === LAN_DEV_ORIGIN) return true;
  if (listCorsOrigins(env).includes(origin)) return true;
  if (origin === toOrigin(env.FRONTEND_URL)) return true;
  if (String(env.NODE_ENV || '').toLowerCase() !== 'production') {
    try {
      return LOCAL_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Origin dùng để dựng link gửi người dùng (mời / voice / import).
 * Origin/Referer từ request chỉ được dùng khi thuộc allowlist.
 */
function trustedFrontendUrl(req, env = process.env) {
  const candidate = toOrigin(resolveFrontendUrl(req));
  if (isAllowedOrigin(candidate, env)) return candidate;
  return toOrigin(env.FRONTEND_URL) || listCorsOrigins(env)[0] || LAN_DEV_ORIGIN;
}

module.exports = { trustedFrontendUrl, isAllowedOrigin, toOrigin };
