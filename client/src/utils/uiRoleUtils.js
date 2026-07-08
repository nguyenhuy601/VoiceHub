const UI_ROLE_STORAGE_KEY = 'vh_ui_role_overlay';

export function resolveUiRoleFromUser(user) {
  if (!user) return 'member';
  if (user.uiRole) return String(user.uiRole).toLowerCase();
  // systemRole: tài khoản hệ thống; role: có thể là org/demo overlay — không dùng lẫn.
  const systemRole = String(user.systemRole || '').toLowerCase();
  if (systemRole === 'admin') return 'admin';
  if (systemRole === 'employee') return 'member';
  const fromApi = String(user.role || '').toLowerCase();
  if (fromApi === 'admin') return 'admin';
  if (fromApi === 'employee' || fromApi === 'user') return 'member';
  if (fromApi) return fromApi;
  return 'member';
}

export function applyUiRoleOverlay(user) {
  if (!user || typeof user !== 'object') return user;
  const uiRole = resolveUiRoleFromUser(user);
  return { ...user, uiRole };
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
