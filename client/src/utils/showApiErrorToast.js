import toast from 'react-hot-toast';
import { resolveApiErrorMessage } from './resolveApiErrorMessage';

/**
 * Hiển thị toast lỗi API theo chuẩn ERROR_CATALOG (messageUser → errorCode → message).
 * @param {unknown} err
 * @param {{ t?: (path: string) => string, fallback?: string }} [opts]
 */
export function showApiErrorToast(err, opts = {}) {
  const fallback = opts.fallback ?? opts.t?.('errors.generic') ?? 'Đã xảy ra lỗi';
  const msg = resolveApiErrorMessage(err, { t: opts.t, fallback });
  toast.error(msg);
  return msg;
}
