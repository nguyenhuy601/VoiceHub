/**
 * Access token: in-memory only (không lưu vào localStorage/sessionStorage).
 * Refresh token: không lưu phía client; server lưu trong HttpOnly cookie.
 */
const KEY = 'token'; // legacy cleanup
const REFRESH_KEY = 'refreshToken'; // legacy cleanup
const TOKEN_CHANGE_EVENT = 'vh-token-changed';

let accessTokenMemory = null;

function notifyTokenChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
  }
}

export function onTokenChange(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TOKEN_CHANGE_EVENT, listener);
  return () => window.removeEventListener(TOKEN_CHANGE_EVENT, listener);
}

/** Đọc access JWT từ memory. */
export function getToken() {
  if (typeof window === 'undefined') return null;
  return accessTokenMemory;
}

/** Chuẩn hóa JWT để gắn header Authorization (bỏ prefix Bearer / quote thừa). */
export function normalizeBearerToken(raw) {
  if (!raw) return '';
  let token = String(raw).trim();
  if (!token || token === 'null' || token === 'undefined') return '';
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

/** Token đã chuẩn hóa từ storage — dùng cho mọi axios instance. */
export function getResolvedBearerToken() {
  return normalizeBearerToken(getToken());
}

/** Decode payload JWT access (không verify — chỉ đọc claim phía client). */
export function getJwtPayload() {
  const token = getResolvedBearerToken();
  if (!token) return null;
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    return JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Đọc claim email từ JWT access token (fallback khi profile/BFF không trả email). */
export function getJwtEmail() {
  return String(getJwtPayload()?.email || '').trim().toLowerCase();
}

/** systemRole từ JWT — nguồn tin cậy khi profile/BFF không trả field này. */
export function getJwtSystemRole() {
  return String(getJwtPayload()?.systemRole || '').trim().toLowerCase();
}

/**
 * Gắn Authorization vào axios config (api.js + apiClient.js).
 * Luôn gọi trong request interceptor cho route cần JWT.
 */
export function applyAuthHeader(config) {
  if (!config) return config;
  const token = getResolvedBearerToken();
  if (!token) return config;

  if (!config.headers) {
    config.headers = {};
  }

  const value = `Bearer ${token}`;
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', value);
  } else {
    config.headers.Authorization = value;
  }
  return config;
}

/** Ghi JWT vào storage đã cấu hình (không mirror sang storage kia). */
export function setToken(token) {
  const value = token != null ? String(token).trim() : '';
  if (!value) return;
  accessTokenMemory = value;
  notifyTokenChange();
}

export function getRefreshToken() {
  // Refresh token is HttpOnly cookie, so JS cannot read it.
  return null;
}

export function setRefreshToken(token) {
  // No-op: refresh token is stored server-side in HttpOnly cookie.
  void token;
}

export function removeToken() {
  accessTokenMemory = null;

  // Cleanup legacy keys (if the app was logged in before switching to HttpOnly refresh cookies).
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  notifyTokenChange();
}
