import {
  PERMISSION_EDITOR_OPTIONS,
  ACTION_LABEL,
  structuralTierFromRoleName,
  resolveRoleTier,
  TIER_EXEC,
  TIER_DIVISION,
  TIER_DEPARTMENT,
  TIER_TEAM,
  TIER_META,
  normalizeRoleDisplayName,
  normalizePermissionEntries,
  permissionStateFromEntries,
  permissionEntriesFromState,
  summarizePermissions,
} from './roleRbacUtils';

export const ORG_DEFAULT_ROLE_NAMES = new Set(['Quản trị viên', 'Nhân sự', 'Thành viên']);

export const MEMBERSHIP_ROLE_LABEL = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị viên',
  hr: 'Nhân sự',
  member: 'Thành viên',
};

/** Nhóm quyền hiển thị — khớp resource BE (role-permission-service). */
export const RBAC_PERMISSION_GROUPS = [
  {
    id: 'chat',
    label: '# Chat',
    resources: [{ resource: 'chat', actions: ['read', 'write', 'delete'] }],
  },
  {
    id: 'task',
    label: 'Công việc',
    resources: [{ resource: 'task', actions: ['read', 'write', 'delete'] }],
  },
  {
    id: 'document',
    label: 'Tài liệu',
    resources: [{ resource: 'document', actions: ['read', 'write', 'delete'] }],
  },
  {
    id: 'voice',
    label: 'Voice & cuộc họp',
    resources: [{ resource: 'voice', actions: ['read', 'write', 'delete'] }],
  },
  {
    id: 'org',
    label: 'Tổ chức & thành viên',
    resources: [
      { resource: 'organization', actions: ['read'] },
      { resource: 'organization_member', actions: ['read', 'write'] },
    ],
  },
  {
    id: 'role',
    label: 'Vai trò hệ thống',
    resources: [{ resource: 'role', actions: ['read', 'write', 'delete', 'admin'] }],
  },
];

export function totalPermissionSlotCount() {
  return RBAC_PERMISSION_GROUPS.reduce(
    (sum, g) => sum + g.resources.reduce((s, r) => s + r.actions.length, 0),
    0
  );
}

export function grantedPermissionCount(permissions) {
  return normalizePermissionEntries(permissions).reduce((acc, p) => acc + p.actions.length, 0);
}

export function isStructuralRole(role) {
  return Boolean(structuralTierFromRoleName(role?.name));
}

export function isSystemCatalogRole(role) {
  if (!role) return false;
  if (isStructuralRole(role)) return false;
  return true;
}

export function isProtectedDefaultRole(role) {
  const name = String(role?.name || '').trim();
  return Boolean(role?.isDefault) || ORG_DEFAULT_ROLE_NAMES.has(name);
}

export function normalizeRoleId(role) {
  return String(role?.id || role?._id || '').trim();
}

export function unwrapList(payload) {
  const body = payload?.data ?? payload;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

export function structureTierSections() {
  return TIER_META.filter((t) => t.id !== TIER_EXEC);
}

export function groupStructuralRoles(roles) {
  const columns = {
    [TIER_DIVISION]: [],
    [TIER_DEPARTMENT]: [],
    [TIER_TEAM]: [],
  };
  for (const role of roles || []) {
    if (!isStructuralRole(role)) continue;
    const tier = structuralTierFromRoleName(role.name) || resolveRoleTier(role);
    if (columns[tier]) columns[tier].push(role);
  }
  for (const key of Object.keys(columns)) {
    columns[key].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  }
  return columns;
}

export function buildStructurePath(member, structureMaps) {
  const parts = [];
  const teamId = member?.teamId || member?.team;
  const depId = member?.departmentId || member?.department;
  const divId = member?.divisionId || member?.division;
  if (divId && structureMaps.divisions.get(String(divId))) {
    parts.push(structureMaps.divisions.get(String(divId)));
  }
  if (depId && structureMaps.departments.get(String(depId))) {
    parts.push(structureMaps.departments.get(String(depId)));
  }
  if (teamId && structureMaps.teams.get(String(teamId))) {
    parts.push(structureMaps.teams.get(String(teamId)));
  }
  return parts.length ? parts.join(' › ') : '—';
}

export function structureMapsFromPayload(structure) {
  const divisions = new Map();
  const departments = new Map();
  const teams = new Map();
  for (const d of structure?.divisions || []) {
    divisions.set(String(d._id || d.id), d.name || 'Khối');
  }
  for (const d of structure?.departments || []) {
    departments.set(String(d._id || d.id), d.name || 'Phòng ban');
  }
  for (const t of structure?.teams || []) {
    teams.set(String(t._id || t.id), t.name || 'Team');
  }
  return { divisions, departments, teams };
}

export {
  normalizeRoleDisplayName,
  normalizePermissionEntries,
  permissionStateFromEntries,
  permissionEntriesFromState,
  summarizePermissions,
  PERMISSION_EDITOR_OPTIONS,
  ACTION_LABEL,
  TIER_EXEC,
  TIER_META,
};
