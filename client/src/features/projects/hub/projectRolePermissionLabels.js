import {
  PROJECT_PERM_GROUP_IDS,
  PROJECT_PERM_KEYS_FOR_LABELS,
  PROJECT_ROLE_PERMISSION_GROUPS,
} from './projectRolePermissionGroups.js';

function safeT(t, path) {
  if (typeof t !== 'function') return undefined;
  const value = t(path);
  if (value == null || value === path) return undefined;
  return String(value);
}

/** Locale path segment for `resource:action` → `resource_action`. */
export function projectPermLocaleKey(permissionKey) {
  return String(permissionKey || '')
    .trim()
    .replace(/:/g, '_');
}

export function labelProjectPermGroup(groupIdOrTitle, t) {
  const raw = String(groupIdOrTitle || '').trim();
  if (!raw) return '—';
  const byId = PROJECT_ROLE_PERMISSION_GROUPS.find((g) => g.id === raw);
  const id = byId?.id || raw;
  return (
    safeT(t, `adminRbac.projPermGroup.${id}`) ||
    byId?.title ||
    raw
  );
}

export function labelProjectPermission(permissionKey, t) {
  const key = String(permissionKey || '').trim();
  if (!key) return '—';
  const localeKey = projectPermLocaleKey(key);
  const labeled = safeT(t, `adminRbac.projPerm.${localeKey}`);
  if (labeled) return labeled;
  const action = key.includes(':') ? key.split(':').pop() : key;
  return action || key;
}

export { PROJECT_PERM_GROUP_IDS, PROJECT_PERM_KEYS_FOR_LABELS };
