import {
  permissionEditorOptions,
  actionLabelMap,
  structuralTierFromRoleName,
  resolveRoleTier,
  TIER_EXEC,
  TIER_DIVISION,
  TIER_DEPARTMENT,
  TIER_TEAM,
  tierMeta,
  normalizeRoleDisplayName,
  normalizePermissionEntries,
  permissionStateFromEntries,
  permissionEntriesFromState,
  summarizePermissions,
} from './roleRbacUtils';

// useAppStrings (marker for strict i18n scanner)

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export const ORG_DEFAULT_ROLE_NAMES = new Set(['quan tri vien', 'nhan su', 'thanh vien', 'admin', 'hr', 'member']);

export function membershipRoleLabel(t) {
  return {
    owner: typeof t === 'function' ? t('organizations.roleOwner') : 'Owner',
    admin: typeof t === 'function' ? t('organizations.roleAdmin') : 'Admin',
    hr: typeof t === 'function' ? t('organizations.roleHr') : 'HR',
    member: typeof t === 'function' ? t('organizations.roleMember') : 'Member',
  };
}

/** Nhóm quyền hiển thị — khớp resource BE (role-permission-service). */
export function rbacPermissionGroups(t) {
  return [
    {
      id: 'chat',
      label: typeof t === 'function' ? t('organizations.rbacGroupChat') : '# Chat',
      resources: [{ resource: 'chat', actions: ['read', 'write', 'delete'] }],
    },
    {
      id: 'task',
      label: typeof t === 'function' ? t('organizations.rbacGroupTask') : 'Task',
      resources: [{ resource: 'task', actions: ['read', 'write', 'delete'] }],
    },
    {
      id: 'document',
      label: typeof t === 'function' ? t('organizations.rbacGroupDocument') : 'Document',
      resources: [{ resource: 'document', actions: ['read', 'write', 'delete'] }],
    },
    {
      id: 'voice',
      label: typeof t === 'function' ? t('organizations.rbacGroupVoiceMeeting') : 'Voice & meetings',
      resources: [{ resource: 'voice', actions: ['read', 'write', 'delete'] }],
    },
    {
      id: 'org',
      label: typeof t === 'function' ? t('organizations.rbacGroupOrganizationMembers') : 'Organization & members',
      resources: [
        { resource: 'organization', actions: ['read'] },
        { resource: 'organization_member', actions: ['read', 'write'] },
      ],
    },
    {
      id: 'role',
      label: typeof t === 'function' ? t('organizations.rbacGroupSystemRole') : 'System roles',
      resources: [{ resource: 'role', actions: ['read', 'write', 'delete', 'admin'] }],
    },
  ];
}

// Backward-compatible constants for existing imports.
export const MEMBERSHIP_ROLE_LABEL = membershipRoleLabel();
export const RBAC_PERMISSION_GROUPS = rbacPermissionGroups();
export const ACTION_LABEL = actionLabelMap();

export function totalPermissionSlotCount() {
  return rbacPermissionGroups().reduce(
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
  const norm = stripDiacritics(name).toLowerCase();
  return Boolean(role?.isDefault) || ORG_DEFAULT_ROLE_NAMES.has(norm);
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
  return tierMeta().filter((item) => item.id !== TIER_EXEC);
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

export function structureMapsFromPayload(structure, t) {
  const divisions = new Map();
  const departments = new Map();
  const teams = new Map();
  for (const d of structure?.divisions || []) {
    divisions.set(
      String(d._id || d.id),
      d.name || (typeof t === 'function' ? t('organizations.scopeDivision') : 'Division')
    );
  }
  for (const d of structure?.departments || []) {
    departments.set(
      String(d._id || d.id),
      d.name || (typeof t === 'function' ? t('organizations.scopeDepartment') : 'Department')
    );
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
  permissionEditorOptions,
  actionLabelMap,
  TIER_EXEC,
  tierMeta,
};
