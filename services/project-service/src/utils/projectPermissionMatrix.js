/**
 * Project Role permission matrix (Phase 2).
 * Keys: resource:action — union across memberships; ∩ Information Level at access layer.
 */

const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const { resolveCanonicalProjectRoleKey } = require('@enterprise/shared/config/masterData');

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
  'task:comment',
  'task:estimate',
  'epic:create',
  'epic:update',
  'epic:delete',
  'story:create',
  'story:update',
  'bug:create',
  'sprint:view',
  'sprint:create',
  'sprint:start',
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
  'approval:request',
  'approval:decide',
  'approval:manage_policy',
  'backlog:view',
  'backlog:update',
  'backlog:prioritize',
  'delivery:view',
  'delivery:manage',
  'report:view',
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
  'backlog:view',
  'delivery:view',
  'report:view',
]);

const DEV_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:create',
  'task:update',
  'task:change_status',
  'task:assign',
  'task:comment',
  'task:estimate',
  'bug:create',
  'files:upload',
  'repository:view',
  'repository:push',
  'approval:request',
]);

const LEAD_PERMS = Object.freeze([
  ...DEV_PERMS,
  'task:delete',
  'repository:merge',
  'approval:decide',
]);

const PO_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'epic:create',
  'epic:update',
  'story:create',
  'story:update',
  'backlog:update',
  'backlog:prioritize',
  'meeting:create',
  'approval:request',
]);

const BA_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'epic:create',
  'epic:update',
  'story:create',
  'story:update',
  'backlog:update',
  'wiki:edit',
  'meeting:create',
  'approval:request',
]);

const SM_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'sprint:create',
  'sprint:start',
  'sprint:close',
  'meeting:create',
]);

const PM_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'project:edit',
  'delivery:manage',
  'release:create',
  'settings:view',
]);

const QA_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'bug:create',
  'task:create',
  'task:update',
  'task:change_status',
  'task:assign',
  'task:comment',
  'task:estimate',
  'files:upload',
]);

const RELEASE_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'release:create',
  'repository:view',
  'repository:merge',
  'files:upload',
]);

const ARCHITECT_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:comment',
  'repository:view',
  'repository:merge',
  'wiki:edit',
  'files:upload',
]);

/** Default matrix by role key */
const DEFAULT_PERMISSIONS_BY_ROLE_KEY = Object.freeze({
  sponsor: [...VIEW_ONLY],
  stakeholder: [...VIEW_ONLY],
  [DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER]: [...PM_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER]: [...PO_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER]: [...SM_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.SOLUTION_ARCHITECT]: [...ARCHITECT_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.TECHNICAL_LEAD]: [...LEAD_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.BUSINESS_ANALYST]: [...BA_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.BACKEND_DEVELOPER]: [...DEV_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.FRONTEND_DEVELOPER]: [...DEV_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.MOBILE_DEVELOPER]: [...DEV_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.FULLSTACK_DEVELOPER]: [...DEV_PERMS, 'repository:merge'],
  [DEFAULT_PROJECT_ROLE_KEYS.QA_LEAD]: [...QA_PERMS, 'approval:decide'],
  [DEFAULT_PROJECT_ROLE_KEYS.QA_ENGINEER]: [...QA_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.UI_UX_DESIGNER]: [
    ...VIEW_ONLY,
    'task:update',
    'task:comment',
    'files:upload',
    'wiki:edit',
  ],
  [DEFAULT_PROJECT_ROLE_KEYS.DEVOPS_ENGINEER]: [...RELEASE_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.OBSERVER]: [...VIEW_ONLY],
  /** Legacy keys — same templates via alias resolve in defaultPermissionsForRoleKey */
  [DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD]: [...LEAD_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.ARCHITECT]: [...ARCHITECT_PERMS],
  [DEFAULT_PROJECT_ROLE_KEYS.SENIOR_DEVELOPER]: [...DEV_PERMS, 'repository:merge'],
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
  watcher: [...VIEW_ONLY],
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
  const raw = String(roleKey || '').trim().toLowerCase();
  const key = resolveCanonicalProjectRoleKey(raw) || raw;
  const list = DEFAULT_PERMISSIONS_BY_ROLE_KEY[key] || DEFAULT_PERMISSIONS_BY_ROLE_KEY[raw];
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
      canViewMembers: true,
      canUpdateSettings: true,
      canViewFiles: true,
      canViewRepository: true,
      permissions: [...PROJECT_PERMISSION_KEYS],
    };
  }
  const canView = hasPermission(set, 'task:view') || hasPermission(set, 'project:view');
  const canManageMembers = hasPermission(set, 'members:manage');
  return {
    canView,
    canManageBoard: hasPermission(set, 'project:edit') || hasPermission(set, 'project:archive'),
    canManageLists: hasPermission(set, 'settings:update') || hasPermission(set, 'project:edit'),
    canCreateCards:
      hasPermission(set, 'task:create') ||
      hasPermission(set, 'story:create') ||
      hasPermission(set, 'bug:create'),
    canEditCards: hasPermission(set, 'task:update'),
    canAssign: hasPermission(set, 'task:assign'),
    canMoveCards:
      hasPermission(set, 'task:change_status') ||
      hasPermission(set, 'task:update') ||
      hasPermission(set, 'task:assign'),
    canMoveToDone:
      hasPermission(set, 'task:change_status') ||
      hasPermission(set, 'task:update') ||
      hasPermission(set, 'task:assign'),
    canChangeStatus:
      hasPermission(set, 'task:change_status') || hasPermission(set, 'task:update'),
    canUseAiConfirm: hasPermission(set, 'task:assign') || hasPermission(set, 'task:create'),
    canManageMembers,
    canViewMembers: canManageMembers || hasPermission(set, 'members:view'),
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
  PO_PERMS,
  BA_PERMS,
  SM_PERMS,
  PM_PERMS,
  DEV_PERMS,
  QA_PERMS,
  isProjectRbacV2Enabled,
  normalizePermissionList,
  defaultPermissionsForRoleKey,
  unionPermissionsFromRoles,
  hasPermission,
  permissionsToBoardCapabilities,
  applyInformationLevelToPermissions,
  assertPermission,
};
