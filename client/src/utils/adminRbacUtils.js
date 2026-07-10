import {
  ACTION_LABEL,
  RBAC_PERMISSION_GROUPS,
  grantedPermissionCount,
  isProtectedDefaultRole,
  isStructuralRole,
  isSystemCatalogRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
  permissionEntriesFromState,
  permissionStateFromEntries,
  totalPermissionSlotCount,
  unwrapList,
} from '../components/Organization/rbacSettingsHelpers';

export {
  ACTION_LABEL,
  RBAC_PERMISSION_GROUPS,
  grantedPermissionCount,
  isProtectedDefaultRole,
  isStructuralRole,
  isSystemCatalogRole,
  normalizeRoleDisplayName,
  normalizeRoleId,
  permissionEntriesFromState,
  permissionStateFromEntries,
  totalPermissionSlotCount,
  unwrapList,
};

export { priorityFromTier, TIER_EXEC } from '../components/Organization/roleRbacUtils';

export function roleDisplayName(role) {
  return normalizeRoleDisplayName(role?.name || '');
}

export function unwrapRoleApi(payload) {
  const body = payload?.data ?? payload;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return body?.data ?? body ?? null;
}
