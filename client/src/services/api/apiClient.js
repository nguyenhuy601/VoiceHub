import axios from 'axios';
import toast from 'react-hot-toast';
import { applyAuthHeader, removeToken } from '../../utils/tokenStorage';
import { isAuthRefreshDisabled, tryRefreshAndRetry } from '../../utils/authRefresh';
import { mapAuthSessionMessageForLogout } from '../../utils/authErrorMessages';
import { extractApiErrorMeta, resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isAutoLogoutDisabled } from '../../utils/devAuth';
import {
  isLandingEmbedActive,
  isLandingEmbedWriteGuardActive,
  isWriteHttpMethod,
} from '../../utils/landingEmbedMode';
import { createTranslator } from '../../locales/buildStrings.js';
import { readStoredLocale } from '../../utils/localeFormat.js';

function apiT() {
  return createTranslator(readStoredLocale());
}

/** Từ chối im lặng mọi lỗi HTTP khi đang xem demo landing — không đụng toast/redirect */
function rejectLandingEmbedSilent(error) {
  const t = apiT();
  const userMessage = resolveApiErrorMessage(error, { t });
  const meta = extractApiErrorMeta(error);
  return Promise.reject({
    message: userMessage,
    userMessage,
    status: meta.status,
    data: meta.data,
    code: meta.code,
    errorCode: meta.errorCode,
    isLandingEmbedSilent: true,
  });
}

const AUTH_PUBLIC_PATHS = [
  '/auth/register',
  '/auth/login',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/resend-verification',
  '/auth/reset-password',
  '/auth/verify-email',
];

function isAuthPublicUrl(url) {
  const u = url || '';
  return AUTH_PUBLIC_PATHS.some((p) => u.includes(p));
}

import { resolveApiBaseUrl } from '../../utils/browserOrigin';
import {
  ensureNetworkControllerStarted,
  networkController,
} from '../../lib/network/networkController.js';
import {
  attachOfflineRequestGate,
  attachSuccessReporter,
  tryTransportRetry,
} from '../../lib/network/attachRetryInterceptors.js';
import { toastNetworkAware } from '../../lib/network/toastNetworkAware.js';

ensureNetworkControllerStarted();

// Đồng bộ với services/api.js — https://voicehub.local luôn dùng /api same-origin.
const API_URL = resolveApiBaseUrl();

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Tăng lên 60s để tránh timeout khi hash password hoặc database operations
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (isLandingEmbedWriteGuardActive() && isWriteHttpMethod(config.method)) {
      const block = new Error('LANDING_EMBED_WRITE_BLOCKED');
      block.code = 'LANDING_EMBED_WRITE_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    if (isLandingEmbedActive() && !isAuthPublicUrl(config.url)) {
      const block = new Error('LANDING_EMBED_API_BLOCKED');
      block.code = 'LANDING_EMBED_API_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    if (!isAuthPublicUrl(config.url)) {
      applyAuthHeader(config);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

attachOfflineRequestGate(apiClient, { networkController });
attachSuccessReporter(apiClient, networkController);

function toNormalizedError(error, fallbackKey = 'errors.generic') {
  const t = apiT();
  const userMessage = resolveApiErrorMessage(error, { t, fallback: t(fallbackKey) });
  const meta = extractApiErrorMeta(error);
  return {
    message: userMessage,
    userMessage,
    status: meta.status,
    data: meta.data,
    code: meta.code,
    errorCode: meta.errorCode,
    original: error,
  };
}

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    if (error?.code === 'LANDING_EMBED_WRITE_BLOCKED' || error?.isLandingEmbedBlock) {
      return Promise.reject(error);
    }

    if (error?.code === 'NETWORK_OFFLINE' || error?.isNetworkOffline) {
      if (isLandingEmbedActive()) {
        return rejectLandingEmbedSilent(error);
      }
      const t = apiT();
      const message = t('api.networkOffline') || t('api.networkError');
      toastNetworkAware(toast, message, networkController);
      return Promise.reject(toNormalizedError({ ...error, code: 'NETWORK_OFFLINE', message }, 'errors.generic'));
    }

    try {
      const retried = await tryTransportRetry(error, apiClient, { networkController });
      if (retried !== null && retried !== undefined) {
        return retried;
      }
    } catch (retryErr) {
      error = retryErr;
    }

    const config = error?.config;

    if (isLandingEmbedActive()) {
      return rejectLandingEmbedSilent(error);
    }

    if (config?.skipGlobalErrorHandling) {
      return Promise.reject(error);
    }

    const t = apiT();
    const message = resolveApiErrorMessage(error, { t });

    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      toastNetworkAware(toast, message || t('api.networkError'), networkController);
      return Promise.reject(toNormalizedError(error, 'errors.generic'));
    }
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      if (!isAuthRefreshDisabled() && !config?.skipAuthRefresh && !isAuthPublicUrl(config?.url)) {
        try {
          const retried = await tryRefreshAndRetry(error, apiClient);
          if (retried !== null && retried !== undefined) {
            return retried;
          }
        } catch (refreshErr) {
          console.warn('[apiClient] Auto refresh failed:', refreshErr?.message || refreshErr);
        }
      }

      if (isAutoLogoutDisabled()) {
        console.warn('[apiClient] VITE_DISABLE_AUTO_LOGOUT: bỏ qua logout/redirect (chỉ debug).');
      } else {
        removeToken();
        window.location.href = '/login';
        const authHint = error.response?.data?.errorCode || error.response?.data?.code || message;
        toast.error(mapAuthSessionMessageForLogout(authHint, readStoredLocale()));
      }
    } else if (error.response?.status === 403) {
      if (!error.config?.skipPermissionDeniedToast) {
        toast.error(message || t('errors.forbidden'));
      }
    } else if (error.response?.status === 404) {
      if (!error.config?.skipNotFoundToast) {
        toast.error(t('errors.notFound'));
      }
    } else if (error.response?.status >= 500) {
      toastNetworkAware(toast, message || t('errors.server'), networkController);
    } else {
      const errorCode = String(
        error.response?.data?.errorCode || error.response?.data?.code || ''
      ).trim();
      if (errorCode !== 'HOURS_SOFT_WARNING') {
        toast.error(message);
      }
    }

    return Promise.reject(toNormalizedError(error, 'errors.generic'));
  }
);

export default apiClient;
