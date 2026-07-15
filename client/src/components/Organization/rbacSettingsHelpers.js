import {
  permissionEditorOptions,
  actionLabelMap,
  structuralTierFromRoleName,
  resolveRoleTier,
  TIER_EXEC,
  TIER_DIVISION,
  TIER_DEPARTMENT,
  TIER_TEAM,
  TIER_EMPLOYEE,
  tierMeta,
  normalizeRoleDisplayName,
  normalizePermissionEntries,
  permissionStateFromEntries,
  permissionEntriesFromState,
  summarizePermissions,
} from './roleRbacUtils';
import {
  ADMIN_RBAC_PERMISSION_GROUPS,
  toLegacyPermissionGroups,
} from '../../config/adminRbacCatalog';

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

/** Nhóm quyền hiển thị — catalog admin RBAC (fine-grained). */
export function rbacPermissionGroups(t) {
  void t;
  return toLegacyPermissionGroups(ADMIN_RBAC_PERMISSION_GROUPS, 'vi');
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
  // Chỉ khối / phòng / team — không gồm Điều hành hay Nhân viên (catalog hệ thống).
  return tierMeta().filter((item) => item.id !== TIER_EXEC && item.id !== TIER_EMPLOYEE);
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

function findNameByIdOrSuffix(map, rawId) {
  const id = String(rawId || '').trim();
  if (!id || !map) return '';
  if (map.get(id)) return map.get(id);
  const lower = id.toLowerCase();
  const suffix = lower.slice(-6);
  for (const [key, name] of map.entries()) {
    const k = String(key).toLowerCase();
    if (k === lower || k.endsWith(suffix) || k.slice(-6) === suffix) return name;
  }
  return '';
}

function findIdBySuffix(map, suffix) {
  const s = String(suffix || '')
    .trim()
    .toLowerCase();
  if (!s || !map) return '';
  for (const key of map.keys()) {
    const k = String(key).toLowerCase();
    if (k.endsWith(s) || k.slice(-6) === s.slice(-6)) return String(key);
  }
  return '';
}

export function buildStructurePath(member, structureMaps) {
  const maps = structureMaps || { divisions: new Map(), departments: new Map(), teams: new Map() };
  const parts = [];
  const teamId = member?.teamId || member?.team;
  const depId = member?.departmentId || member?.department;
  const divId = member?.divisionId || member?.division;
  const divName = findNameByIdOrSuffix(maps.divisions, divId);
  const depName = findNameByIdOrSuffix(maps.departments, depId);
  const teamName = findNameByIdOrSuffix(maps.teams, teamId);
  if (divName) parts.push(divName);
  if (depName) parts.push(depName);
  if (teamName) parts.push(teamName);
  return parts.length ? parts.join(' › ') : '—';
}

/**
 * Suy ra division/department/team từ tên role hierarchy (div_/dep_/team_).
 * Dùng khi membership admin không kèm field team/department.
 */
export function memberScopeFromRoleNames(roleNames, structureMaps) {
  const maps = structureMaps || { divisions: new Map(), departments: new Map(), teams: new Map() };
  let divisionId = '';
  let departmentId = '';
  let teamId = '';
  for (const name of roleNames || []) {
    const lower = String(name || '').toLowerCase();
    const divMatch = lower.match(/div_([a-z0-9_-]{6,})/);
    const depMatch = lower.match(/dep_([a-z0-9_-]{6,})/);
    const teamMatch = lower.match(/team_([a-z0-9_-]{6,})/);
    if (!divisionId && divMatch) divisionId = findIdBySuffix(maps.divisions, divMatch[1]);
    if (!departmentId && depMatch) departmentId = findIdBySuffix(maps.departments, depMatch[1]);
    if (!teamId && teamMatch) teamId = findIdBySuffix(maps.teams, teamMatch[1]);
  }
  return { divisionId, departmentId, teamId };
}

function putNamedEntity(map, entity, fallbackName) {
  const id = String(entity?._id || entity?.id || '').trim();
  if (!id) return;
  map.set(id, entity?.name || fallbackName);
}

/**
 * API GET /structure trả { branches, divisionsFlat } — không phải divisions/departments/teams phẳng.
 */
export function structureMapsFromPayload(structure, t) {
  const divisions = new Map();
  const departments = new Map();
  const teams = new Map();
  const divFallback = typeof t === 'function' ? t('organizations.scopeDivision') : 'Division';
  const depFallback = typeof t === 'function' ? t('organizations.scopeDepartment') : 'Department';

  const ingestDivisionNode = (div) => {
    putNamedEntity(divisions, div, divFallback);
    for (const dept of div?.departments || []) {
      putNamedEntity(departments, dept, depFallback);
      for (const team of dept?.teams || []) {
        putNamedEntity(teams, team, 'Team');
      }
    }
  };

  for (const d of structure?.divisions || []) ingestDivisionNode(d);
  for (const d of structure?.divisionsFlat || []) ingestDivisionNode(d);
  for (const d of structure?.departments || []) putNamedEntity(departments, d, depFallback);
  for (const team of structure?.teams || []) putNamedEntity(teams, team, 'Team');

  for (const branch of structure?.branches || []) {
    for (const div of branch?.divisions || []) ingestDivisionNode(div);
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
