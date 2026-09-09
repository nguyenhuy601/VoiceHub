const DEFAULT_COOKIE_NAME = 'refresh_token';
const DEFAULT_COOKIE_PATH = '/api/auth';
/** Non-HttpOnly marker — JS can detect "has session" without reading the refresh token. */
const SESSION_MARKER_NAME = 'vh_has_session';
const SESSION_MARKER_VALUE = '1';
/** Marker must be Path=/ so document.cookie on SPA (/app, /login) can read it. */
const SESSION_MARKER_PATH = '/';

function getRefreshCookieName() {
  return String(process.env.AUTH_REFRESH_COOKIE_NAME || DEFAULT_COOKIE_NAME).trim();
}

function getRefreshCookiePath() {
  return String(process.env.AUTH_REFRESH_COOKIE_PATH || DEFAULT_COOKIE_PATH).trim();
}

function getSessionMarkerCookieName() {
  return String(process.env.AUTH_SESSION_MARKER_COOKIE_NAME || SESSION_MARKER_NAME).trim();
}

function getSessionMarkerCookiePath() {
  return String(process.env.AUTH_SESSION_MARKER_COOKIE_PATH || SESSION_MARKER_PATH).trim() || '/';
}

function parseBooleanEnv(value, defaultValue) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return defaultValue;
}

function isForwardedHttps(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}

function isCookieSecure(req) {
  const envVal = process.env.AUTH_REFRESH_COOKIE_SECURE;
  if (envVal != null && String(envVal).trim() !== '') {
    return parseBooleanEnv(envVal, false);
  }
  return (
    isForwardedHttps(req) ||
    Boolean(req?.secure) ||
    process.env.NODE_ENV === 'production'
  );
}

function getCookieValueFromHeader(cookieHeader, cookieName) {
  if (!cookieHeader || !cookieName) return null;
  const parts = String(cookieHeader).split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    const name = String(rawName || '').trim();
    if (!name || name !== cookieName) continue;
    const value = rest.join('=');
    return decodeURIComponent(String(value || '').trim());
  }
  return null;
}

function readRefreshTokenFromReq(req) {
  const cookieName = getRefreshCookieName();
  const fromParser = req?.cookies?.[cookieName];
  if (fromParser) return String(fromParser).trim();
  const cookieHeader = req?.headers?.cookie;
  return getCookieValueFromHeader(cookieHeader, cookieName);
}

function cookieSecurityOptions(req) {
  return {
    secure: isCookieSecure(req),
    sameSite: 'strict',
  };
}

function setRefreshCookie(res, refreshTokenRaw, req) {
  const sec = cookieSecurityOptions(req);

  // Session cookie: không set Max-Age/Expires. Path scoped to auth API only.
  res.cookie(getRefreshCookieName(), refreshTokenRaw, {
    ...sec,
    path: getRefreshCookiePath(),
    httpOnly: true,
  });

  // Marker readable by JS on SPA pages — Path=/ so document.cookie can see it.
  res.cookie(getSessionMarkerCookieName(), SESSION_MARKER_VALUE, {
    ...sec,
    path: getSessionMarkerCookiePath(),
    httpOnly: false,
  });
}

/** Chỉ xóa cookie khi refresh bị từ chối vì token thiếu/hết hạn — không xóa khi DB 503. */
function shouldClearCookiesOnRefreshFailure(error) {
  return String(error?.errorCode || '').trim() === 'AUTH_REFRESH_INVALID';
}

function clearRefreshCookie(res, req) {
  const sec = cookieSecurityOptions(req);

  res.clearCookie(getRefreshCookieName(), {
    ...sec,
    path: getRefreshCookiePath(),
    httpOnly: true,
  });
  res.clearCookie(getSessionMarkerCookieName(), {
    ...sec,
    path: getSessionMarkerCookiePath(),
    httpOnly: false,
  });
  // Also clear legacy marker that may have been set with Path=/api/auth before this fix.
  res.clearCookie(getSessionMarkerCookieName(), {
    ...sec,
    path: getRefreshCookiePath(),
    httpOnly: false,
  });
}

module.exports = {
  SESSION_MARKER_NAME,
  SESSION_MARKER_VALUE,
  SESSION_MARKER_PATH,
  getRefreshCookieName,
  getRefreshCookiePath,
  getSessionMarkerCookieName,
  getSessionMarkerCookiePath,
  isCookieSecure,
  readRefreshTokenFromReq,
  setRefreshCookie,
  clearRefreshCookie,
  shouldClearCookiesOnRefreshFailure,
};
