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

/** GET /roles/user/... có thể bọc data nhiều lớp; không trả [] khi payload thực ra là list. */
export function unwrapUserRoleList(payload) {
  let cur = payload;
  for (let i = 0; i < 5 && cur != null; i += 1) {
    if (Array.isArray(cur)) return cur;
    if (Array.isArray(cur.roles)) return cur.roles;
    if (Array.isArray(cur.items)) return cur.items;
    if (Array.isArray(cur.data)) {
      cur = cur.data;
      continue;
    }
    const next = cur.data ?? cur.result;
    if (next == null || next === cur) break;
    cur = next;
  }
  return [];
}

/** Id vai trò từ phần tử getUserRoles (Role doc, UserRole, hoặc id thuần). */
export function assignedRoleIdFromRow(row, depth = 0) {
  if (row == null || depth > 4) return '';
  if (typeof row === 'string' || typeof row === 'number') return String(row).trim();
  if (typeof row !== 'object') return '';
  const direct = normalizeRoleId(row);
  if (direct) return direct;
  return assignedRoleIdFromRow(row.roleId, depth + 1) || assignedRoleIdFromRow(row.role, depth + 1);
}
