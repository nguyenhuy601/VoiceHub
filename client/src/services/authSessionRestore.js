import authService from './authService';
import { getJwtEmail, getJwtSystemRole, getToken } from '../utils/tokenStorage';
import { mergeAuthUserFromProfile, unwrapApiData } from '../utils/helpers';
import { loadBootstrapShell } from './bootstrapService';
import { readStoredSuite } from '../utils/suitePathUtils';
import { isAuthRefreshDisabled, refreshAccessTokenSingleFlight } from '../utils/authRefresh';
import { hasSessionMarkerCookie } from '../utils/sessionMarkerCookie';

let inflightRestore = null;

function sessionBaseFromJwt(extra = {}) {
  const systemRole = getJwtSystemRole();
  return {
    email: getJwtEmail() || undefined,
    ...(systemRole ? { systemRole } : {}),
    ...extra,
  };
}

/**
 * Khôi phục phiên sau reload — một flight (StrictMode / tab song song).
 * Ưu tiên GET /api/bootstrap (đã gồm user + orgs + badges); fallback getCurrentUser.
 */
export async function restoreAuthSession() {
  let token = getToken();
  if (!token) {
    // Avoid guest spam POST /auth/refresh-token when no session marker (HttpOnly refresh alone is invisible to JS).
    if (!isAuthRefreshDisabled() && hasSessionMarkerCookie()) {
      try {
        await refreshAccessTokenSingleFlight();
      } catch {
        // Silent restore: fail is OK; we'll return guest session.
      }
    }
    token = getToken();
    if (!token) return { user: null, fromBootstrap: false };
  }

  if (inflightRestore) {
    return inflightRestore;
  }

  inflightRestore = (async () => {
    try {
      const boot = await loadBootstrapShell({ suite: readStoredSuite() });
      if (boot?.user) {
        return {
          user: mergeAuthUserFromProfile(sessionBaseFromJwt(), boot.user),
          fromBootstrap: true,
        };
      }
    } catch (bootErr) {
      console.warn('[authSession] Bootstrap restore failed, fallback /auth/me:', bootErr?.message || bootErr);
    }

    const userData = await authService.getCurrentUser();
    const profile = unwrapApiData(userData) || userData;
    return {
      user: mergeAuthUserFromProfile(sessionBaseFromJwt(), profile),
      fromBootstrap: false,
    };
  })();

  try {
    return await inflightRestore;
  } finally {
    inflightRestore = null;
  }
}

export async function restoreAuthSessionAfterLogin(loginUser) {
  const base = mergeAuthUserFromProfile(sessionBaseFromJwt(), loginUser || {});
  try {
    const boot = await loadBootstrapShell({ suite: readStoredSuite() });
    if (boot?.user) {
      return mergeAuthUserFromProfile(base, boot.user);
    }
  } catch (bootErr) {
    console.warn('[authSession] Bootstrap after login failed:', bootErr?.message || bootErr);
  }

  try {
    const me = await authService.getCurrentUser();
    return mergeAuthUserFromProfile(base, unwrapApiData(me) || me);
  } catch {
    return base;
  }
}
