import axios from 'axios';
import {
  applyAuthHeader,
  setToken,
} from './tokenStorage';
import { resolveApiBaseUrl } from './browserOrigin';

let refreshPromise = null;

export function isAuthRefreshDisabled() {
  const raw = String(import.meta.env.VITE_DISABLE_AUTH_REFRESH || '').trim().toLowerCase();
  const disabled = raw === '1' || raw === 'true' || raw === 'yes';
  if (disabled && import.meta.env.PROD) {
    console.warn(
      '[VoiceHub] VITE_DISABLE_AUTH_REFRESH is enabled in production — expired sessions may not auto-refresh.'
    );
  }
  return disabled;
}

async function callRefreshEndpoint() {
  const API_URL = resolveApiBaseUrl();
  const res = await axios.post(
    `${API_URL}/auth/refresh-token`,
    {},
    {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
        // Header required by CSRF guard in refresh/logout flows.
        'X-VoiceHub-Client': '1',
      },
      timeout: 30000,
    }
  );

  const envelope = res.data;
  const body = envelope?.data !== undefined ? envelope.data : envelope;
  const accessToken = body?.accessToken || body?.token;
  if (!accessToken) {
    throw new Error('INVALID_REFRESH_RESPONSE');
  }

  setToken(accessToken);
  return accessToken;
}

/** Single-flight refresh — tránh storm khi nhiều request 401 cùng lúc. */
export function refreshAccessTokenSingleFlight() {
  if (!refreshPromise) {
    refreshPromise = callRefreshEndpoint().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/**
 * Thử refresh + retry request gốc (tối đa 1 lần).
 * @returns {Promise<unknown>|null} response nếu retry thành công; null nếu không áp dụng
 */
export async function tryRefreshAndRetry(error, axiosInstance) {
  const config = error?.config;
  if (!config || config.__authRefreshRetried || config.skipAuthRefresh) {
    return null;
  }

  const url = String(config.url || '');
  if (url.includes('/auth/refresh-token') || url.includes('/auth/login')) {
    return null;
  }

  await refreshAccessTokenSingleFlight();
  config.__authRefreshRetried = true;
  applyAuthHeader(config);
  return axiosInstance.request(config);
}
