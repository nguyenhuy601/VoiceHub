/**
 * Project Role permission matrix (Phase 2).
 * Keys: resource:action — union across memberships; ∩ Information Level at access layer.
 */

const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

const PROJECT_PERMISSION_KEYS = Object.freeze([
  'project:view',
  'project:edit',
  'project:archive',
  'project:delete',
  'task:view',
  'task:create',
  'task:update',
  'task:change_status',
  'task:delete',
  'task:assign',
  'sprint:view',
  'sprint:create',
  'sprint:close',
  'repository:view',
  'repository:push',
  'repository:merge',
  'wiki:view',
  'wiki:edit',
  'meeting:view',
  'meeting:create',
  'release:view',
  'release:create',
  'files:view',
  'files:upload',
  'files:delete',
  'members:view',
  'members:manage',
  'settings:view',
  'settings:update',
]);

const PERM_SET = new Set(PROJECT_PERMISSION_KEYS);

const VIEW_ONLY = Object.freeze([
  'project:view',
  'task:view',
  'sprint:view',
  'files:view',
  'members:view',
  'settings:view',
  'wiki:view',
  'meeting:view',
  'release:view',
]);

const DEV_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:create',
  'task:update',
  'task:change_status',
  'task:assign',
  'files:upload',
  'wiki:edit',
  'meeting:create',
  'repository:view',
  'repository:push',
]);

const LEAD_PERMS = Object.freeze([
  ...DEV_PERMS,
  'task:delete',
  'sprint:create',
  'sprint:close',
  'project:edit',
  'members:manage',
  'settings:update',
  'files:delete',
  'repository:merge',
]);

const PM_PERMS = Object.freeze([...PROJECT_PERMISSION_KEYS]);

const QA_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:update',
  'task:change_status',
  'task:assign',
  'files:upload',
  'release:view',
  'meeting:create',
]);

const RELEASE_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:update',
  'task:change_status',
  'release:view',
  'release:create',
  'repository:view',
  'repository:merge',
  'files:upload',
]);

/** Default matrix by role key */
const DEFAULT_PERMISSIONS_BY_ROLE_KEY = Object.freeze({
  [DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER]: [...PM_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER]: [...PM_PERMS].filter(
    (k) => k !== 'project:delete' && k !== 'repository:merge'
  ),
  [DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER]: [
    ...VIEW_ONLY,
    'task:create',
    'task:update',
    'task:change_status',
    'task:assign',
    'sprint:create',
    'sprint:close',
    'members:view',
    'meeting:create',
    'files:upload',
  ],
  [DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD]: [...LEAD_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.ARCHITECT]: [
    ...VIEW_ONLY,
    'task:update',
    'task:change_status',
    'repository:view',
    'repository:merge',
    'wiki:edit',
    'files:upload',
  ],
  [DEFAULT_PROJECT_ROLE_KEYS.SENIOR_DEVELOPER]: [...LEAD_PERMS].filter(
    (k) => k !== 'project:delete' && k !== 'project:archive' && k !== 'settings:update'
  ),
  [DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER]: [...DEV_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.JUNIOR]: [...DEV_PERMS].filter((k) => k !== 'repository:push'),
  [DEFAULT_PROJECT_ROLE_KEYS.INTERN]: [
    ...VIEW_ONLY,
    'task:update',
    'task:change_status',
    'files:upload',
  ],
  [DEFAULT_PROJECT_ROLE_KEYS.QA]: [...QA_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.TESTER]: [...QA_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.REVIEWER]: [
    ...VIEW_ONLY,
    'task:update',
    'task:change_status',
    'repository:view',
  ],
  [DEFAULT_PROJECT_ROLE_KEYS.RELEASE_MANAGER]: [...RELEASE_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.WATCHER]: [...VIEW_ONLY],
});

function isProjectRbacV2Enabled() {
  const raw = String(process.env.PROJECT_RBAC_V2 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {string[]|unknown} raw
 * @returns {string[]}
 */
function normalizePermissionList(raw = []) {
  const input = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const key = String(item || '').trim().toLowerCase();
    if (!PERM_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function defaultPermissionsForRoleKey(roleKey) {
  const key = String(roleKey || '').trim().toLowerCase();
  const list = DEFAULT_PERMISSIONS_BY_ROLE_KEY[key];
  if (list) return normalizePermissionList(list);
  return normalizePermissionList(VIEW_ONLY);
}

/**
 * Union permissions from multiple role docs.
 * @param {Array<{ key?: string, permissions?: string[] }>} roles
 */
function unionPermissionsFromRoles(roles = []) {
  const set = new Set();
  for (const role of Array.isArray(roles) ? roles : []) {
    const fromDoc = normalizePermissionList(role?.permissions);
    if (fromDoc.length) {
      for (const p of fromDoc) set.add(p);
      continue;
    }
    for (const p of defaultPermissionsForRoleKey(role?.key)) set.add(p);
  }
  return [...set];
}

function hasPermission(permissionSet, permissionKey) {
  const key = String(permissionKey || '').trim().toLowerCase();
  if (!key) return false;
  if (permissionSet instanceof Set) return permissionSet.has(key);
  if (Array.isArray(permissionSet)) return permissionSet.includes(key);
  return false;
}

/**
 * Map permission set → legacy boardCapabilities shape (1 release adapter).
 */
function permissionsToBoardCapabilities(perms = [], { isCreator = false, isOrgAdmin = false } = {}) {
  const set = perms instanceof Set ? perms : new Set(normalizePermissionList(perms));
  if (isCreator || isOrgAdmin) {
    return {
      canView: true,
      canManageBoard: true,
      canManageLists: true,
      canCreateCards: true,
      canEditCards: true,
      canAssign: true,
      canMoveCards: true,
      canMoveToDone: true,
      canChangeStatus: true,
      canUseAiConfirm: true,
      canManageMembers: true,
      canUpdateSettings: true,
      canViewFiles: true,
      canViewRepository: true,
      permissions: [...PROJECT_PERMISSION_KEYS],
    };
  }
  const canView = hasPermission(set, 'task:view') || hasPermission(set, 'project:view');
  return {
    canView,
    canManageBoard: hasPermission(set, 'project:edit') || hasPermission(set, 'project:archive'),
    canManageLists: hasPermission(set, 'settings:update') || hasPermission(set, 'project:edit'),
    canCreateCards: hasPermission(set, 'task:create'),
    canEditCards: hasPermission(set, 'task:update'),
    canAssign: hasPermission(set, 'task:assign'),
    canMoveCards: canView,
    canMoveToDone:
      hasPermission(set, 'task:change_status') ||
      hasPermission(set, 'task:update') ||
      hasPermission(set, 'task:assign'),
    canChangeStatus:
      hasPermission(set, 'task:change_status') || hasPermission(set, 'task:update'),
    canUseAiConfirm: hasPermission(set, 'task:assign') || hasPermission(set, 'task:create'),
    canManageMembers: hasPermission(set, 'members:manage'),
    canUpdateSettings: hasPermission(set, 'settings:update') || hasPermission(set, 'project:edit'),
    canViewFiles: hasPermission(set, 'files:view'),
    canViewRepository: hasPermission(set, 'repository:view'),
    permissions: [...set],
  };
}

/**
 * Information Level gate: summary cannot exercise task detail actions.
 */
function applyInformationLevelToPermissions(perms = [], informationLevel = 'details') {
  const level = String(informationLevel || 'details').toLowerCase();
  const list = normalizePermissionList(perms);
  if (level !== 'summary') return list;
  const allowedOnSummary = new Set(['project:view', 'members:view', 'settings:view']);
  return list.filter((p) => allowedOnSummary.has(p));
}

function assertPermission(perms, permissionKey, message) {
  if (hasPermission(perms, permissionKey)) return;
  const err = new Error(message || `Thiếu quyền ${permissionKey}`);
  err.statusCode = 403;
  err.errorCode = 'PROJECT_PERMISSION_DENIED';
  throw err;
}

module.exports = {
  PROJECT_PERMISSION_KEYS,
  DEFAULT_PERMISSIONS_BY_ROLE_KEY,
  VIEW_ONLY,
  isProjectRbacV2Enabled,
  normalizePermissionList,
  defaultPermissionsForRoleKey,
  unionPermissionsFromRoles,
  hasPermission,
  permissionsToBoardCapabilities,
  applyInformationLevelToPermissions,
  assertPermission,
};
