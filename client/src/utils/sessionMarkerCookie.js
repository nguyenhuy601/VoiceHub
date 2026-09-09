/** Non-HttpOnly marker — JS detect "has session" without reading the refresh token. */
export const SESSION_MARKER_COOKIE = 'vh_has_session';

/** True when non-HttpOnly marker cookie is present (set alongside refresh HttpOnly cookie). */
export function hasSessionMarkerCookie() {
  if (typeof document === 'undefined') return false;
  try {
    const raw = String(document.cookie || '');
    return raw.split(';').some((part) => {
      const [name, ...rest] = part.trim().split('=');
      if (String(name || '').trim() !== SESSION_MARKER_COOKIE) return false;
      const value = decodeURIComponent(rest.join('=').trim());
      return value === '1' || value === 'true';
    });
  } catch {
    return false;
  }
}

/** Clear leftover marker so restoreAuthSession does not spam POST /auth/refresh-token. */
export function clearSessionMarkerCookie() {
  if (typeof document === 'undefined') return;
  const expire = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
  document.cookie = expire;
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    document.cookie = `${expire}; Secure`;
  }
}
