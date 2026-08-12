/**
 * Khi bật (VITE_DISABLE_AUTO_LOGOUT=true): không xóa token / redirect /login khi 401 — tiện debug backend.
 * Nhớ tắt trước khi build production.
 */
export function isAutoLogoutDisabled() {
  const v = import.meta.env.VITE_DISABLE_AUTO_LOGOUT;
  const disabled = v === 'true' || v === '1' || v === 1;
  if (disabled && import.meta.env.PROD) {
    console.warn(
      '[VoiceHub] VITE_DISABLE_AUTO_LOGOUT is enabled in production — session revocation may not apply on the client.'
    );
  }
  return disabled;
}
