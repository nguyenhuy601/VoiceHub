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
import {
  permissionDraftForEditor,
  permissionEntriesForPersist,
} from './rbacPermissionBridge';

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
  permissionDraftForEditor,
  permissionEntriesForPersist,
  totalPermissionSlotCount,
  unwrapList,
};

export {
  TIER_ORDER,
  TIER_EXEC,
  TIER_DIVISION,
  TIER_DEPARTMENT,
  TIER_TEAM,
  TIER_EMPLOYEE,
  groupRolesByTier,
  groupRolesByPriority,
  moveRoleInColumns,
  prioritiesFromColumns,
  priorityFromTier,
  resolveRoleTier,
  tierMeta,
} from '../components/Organization/roleRbacUtils';

export function roleDisplayName(role) {
  return normalizeRoleDisplayName(role?.name || '');
}

export function unwrapRoleApi(payload) {
  const body = payload?.data ?? payload;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return body?.data ?? body ?? null;
}
