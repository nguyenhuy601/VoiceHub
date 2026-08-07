import { createTranslator } from '../locales/buildStrings.js';
import { readStoredLocale } from './localeFormat.js';

export const API_ERROR_CODES = [
  'AUTH_NO_TOKEN',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_EMAIL_NOT_VERIFIED',
  'AUTH_ACCOUNT_INACTIVE',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_DB_UNAVAILABLE',
  'USER_PROFILE_NOT_FOUND',
  'USER_NOT_AUTHENTICATED',
  'USER_PROFILE_FORBIDDEN',
  'USER_VALIDATION',
];

function stripTechnicalPrefix(message) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^error\s+[a-z_ ]+:\s*/i, '')
    .replace(/^error:\s*/i, '')
    .trim();
}

/**
 * @param {unknown} errorLike
 * @param {{ t?: (path: string) => string, locale?: string, fallback?: string } | string} [optsOrFallback]
 */
export function resolveApiErrorMessage(errorLike, optsOrFallback = {}) {
  const opts = typeof optsOrFallback === 'string' ? { fallback: optsOrFallback } : optsOrFallback;
  const locale = opts.locale || readStoredLocale();
  const t = opts.t || createTranslator(locale);
  const fallback = opts.fallback ?? t('errors.generic');

  const data = errorLike?.data || errorLike?.response?.data || {};
  const code = data?.errorCode || data?.code || '';
  if (code) {
    const mapped = t(`errors.codes.${code}`);
    if (mapped && mapped !== `errors.codes.${code}`) return mapped;
  }
  const messageUser = data?.messageUser || '';
  const msg = stripTechnicalPrefix(data?.message || errorLike?.message || messageUser || '');
  // Legacy BE: validatePasswordStrength trả chuỗi Anh thuần (chưa có errorCode).
  if (/Password must (contain|be at least)/i.test(msg) || /uppercase letter|special character/i.test(msg)) {
    const weak = t('errors.codes.AUTH_WEAK_PASSWORD');
    if (weak && weak !== 'errors.codes.AUTH_WEAK_PASSWORD') return weak;
  }
  if (String(messageUser).trim()) return String(messageUser).trim();
  return msg || fallback;
}

export function extractApiErrorMeta(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || null;
  return {
    status: errorLike?.status || errorLike?.response?.status || null,
    code: errorLike?.code || '',
    errorCode: data?.errorCode || data?.code || '',
    data,
  };
}
