import { DEMO_EMAIL_ROLES, isDemoAccountsEnabled } from '../config/demoAccounts';

const UI_ROLE_STORAGE_KEY = 'vh_ui_role_overlay';

export function resolveUiRoleFromUser(user) {
  if (!user) return 'member';
  if (user.uiRole) return String(user.uiRole).toLowerCase();
  const email = String(user.email || '').toLowerCase();
  if (isDemoAccountsEnabled() && DEMO_EMAIL_ROLES[email]) {
    return DEMO_EMAIL_ROLES[email];
  }
  const fromApi = String(user.role || user.systemRole || '').toLowerCase();
  if (fromApi && fromApi !== 'user') return fromApi;
  return 'member';
}

export function applyUiRoleOverlay(user) {
  if (!user || typeof user !== 'object') return user;
  const uiRole = resolveUiRoleFromUser(user);
  const merged = { ...user, uiRole };
  if (isDemoAccountsEnabled()) {
    try {
      localStorage.setItem(UI_ROLE_STORAGE_KEY, uiRole);
    } catch {
      // ignore
    }
  }
  return merged;
}

export function readStoredUiRole() {
  if (!import.meta.env.DEV) return null;
  try {
    return localStorage.getItem(UI_ROLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredUiRole() {
  try {
    localStorage.removeItem(UI_ROLE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
