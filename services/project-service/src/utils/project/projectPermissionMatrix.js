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
  /** Hoàn thành dự án (complete) — tách khỏi project:archive. */
  'project:complete',
  'project:delete',
  /** Quản lý matrix Project Role trong dự án (PO) — khác settings:update và khác Admin catalog. */
  'project:roles',
  'task:view',
  'task:create',
  'task:update',
  'task:change_status',
  'task:drag_to_done',
  'task:delete',
  'task:assign',
  /** Xác nhận đề xuất AI trên board — tách khỏi task:assign. */
  'task:ai_confirm',
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
  'sprint:delete',
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
  /** Tạo / sắp xếp / archive cột (list) trên board — tách khỏi settings:update. */
  'board:manage_lists',
  /** Admin board (archive board, elevated board ops) — tách khỏi project:edit (cấu trúc dự án). */
  'board:admin',
  'approval:request',
  'approval:decide',
  'approval:manage_policy',
  'backlog:view',
  'backlog:update',
  'backlog:prioritize',
  'delivery:view',
  'delivery:manage',
  'report:view',
  /** Tab / API activity log dự án — tách khỏi report:view. */
  'activity:view',
  'change_request:view',
  'change_request:create',
  'change_request:update',
  'change_request:delete',
  'analysis:view',
  'analysis:document_upload',
  'analysis:artifact_import',
  'analysis:artifact_edit',
  'analysis:submit_ba_review',
  'analysis:ba_review',
  'analysis:tech_review',
  'analysis:po_review',
  'analysis:manage_trace',
  'analysis:cut_srs',
  'delivery_phase:change',
  'uat:sign_off',
  /** Phase 4 SoD — nghiệm thu / hoàn tất bàn giao (chỉ PO; tách khỏi uat:sign_off). */
  'handover:accept',
  'planning:view',
  'planning:artifact_edit',
  'planning:submit_review',
  'planning:ba_review',
  'planning:tech_review',
  'planning:pm_review',
  'planning:po_review',
  'planning:cut_baseline',
  'planning:publish_wbs',
]);

const PERM_SET = new Set(PROJECT_PERMISSION_KEYS);

const ANALYSIS_VIEW = Object.freeze(['analysis:view']);

const ANALYSIS_BA_PERMS = Object.freeze([
  ...ANALYSIS_VIEW,
  'analysis:document_upload',
  'analysis:artifact_import',
  'analysis:artifact_edit',
  'analysis:submit_ba_review',
  'analysis:ba_review',
  'analysis:manage_trace',
]);

/** PO: duyệt + sửa BG/SCOPE (artifact_edit) — không upload Raw/Analysis (BA chủ trì). */
const ANALYSIS_PO_PERMS = Object.freeze([
  ...ANALYSIS_VIEW,
  'analysis:artifact_edit',
  'analysis:po_review',
  'analysis:manage_trace',
  'analysis:cut_srs',
]);

/** PM: cut SRS / đổi phase — không upload Raw/Analysis; không đứng cổng PO (DEC). */
const ANALYSIS_PM_PERMS = Object.freeze([
  ...ANALYSIS_VIEW,
  'analysis:manage_trace',
  'analysis:cut_srs',
  'delivery_phase:change',
]);

const ANALYSIS_TECH_PERMS = Object.freeze([
  ...ANALYSIS_VIEW,
  'analysis:tech_review',
  'analysis:manage_trace',
]);

const PLANNING_VIEW = Object.freeze(['planning:view']);

/** BA: xem plan / cung cấp input ngoài app — không chủ trì WBS, không cổng duyệt (DEC D9). */
const PLANNING_BA_PERMS = Object.freeze([...PLANNING_VIEW]);

/** Tech: chỉ cổng kỹ thuật — không sửa WBS. */
const PLANNING_TECH_PERMS = Object.freeze([
  ...PLANNING_VIEW,
  'planning:tech_review',
]);

/** PM: chủ trì WBS/schedule/resource + cổng PM + cut/publish. */
const PLANNING_PM_PERMS = Object.freeze([
  ...PLANNING_VIEW,
  'planning:artifact_edit',
  'planning:submit_review',
  'planning:pm_review',
  'planning:cut_baseline',
  'planning:publish_wbs',
]);

/** PO: accept plan (cổng PO) — không chủ trì sửa WBS. */
const PLANNING_PO_PERMS = Object.freeze([
  ...PLANNING_VIEW,
  'planning:po_review',
  'planning:cut_baseline',
]);

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
  'activity:view',
  'change_request:view',
  ...ANALYSIS_VIEW,
  ...PLANNING_VIEW,
]);

const DEV_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:create',
  'task:update',
  'task:change_status',
  'task:assign',
  'task:ai_confirm',
  'task:comment',
  'task:estimate',
  'bug:create',
  'files:upload',
  'repository:view',
  'repository:push',
  'approval:request',
  'change_request:create',
]);

const LEAD_PERMS = Object.freeze([
  ...DEV_PERMS,
  'task:drag_to_done',
  'task:delete',
  'repository:merge',
  'approval:decide',
  'change_request:update',
  'change_request:delete',
  ...ANALYSIS_TECH_PERMS,
  ...PLANNING_TECH_PERMS,
]);

const PO_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'project:roles',
  'epic:create',
  'epic:update',
  'story:create',
  'story:update',
  'backlog:update',
  'backlog:prioritize',
  'meeting:create',
  'approval:request',
  'change_request:create',
  'change_request:update',
  'uat:sign_off',
  'handover:accept',
  ...ANALYSIS_PO_PERMS,
  ...PLANNING_PO_PERMS,
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
  'change_request:create',
  'change_request:update',
  ...ANALYSIS_BA_PERMS,
  ...PLANNING_BA_PERMS,
]);

const SM_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'sprint:create',
  'sprint:start',
  'sprint:close',
  'sprint:delete',
  'meeting:create',
]);

const PM_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'project:edit',
  'project:archive',
  'project:complete',
  'project:roles',
  'members:manage',
  'settings:update',
  'board:manage_lists',
  'board:admin',
  'task:drag_to_done',
  'delivery:manage',
  'release:create',
  'change_request:create',
  'change_request:update',
  'change_request:delete',
  'uat:sign_off',
  ...ANALYSIS_PM_PERMS,
  ...PLANNING_PM_PERMS,
]);

const QA_PERMS = Object.freeze([
  ...VIEW_ONLY,
  'task:drag_to_done',
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
  ...ANALYSIS_TECH_PERMS,
  ...PLANNING_TECH_PERMS,
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
 * @returns {{ valid: string[], unknown: string[] }}
 */
function splitPermissionList(raw = []) {
  const input = Array.isArray(raw) ? raw : [];
  const valid = [];
  const unknown = [];
  const seenValid = new Set();
  const seenUnknown = new Set();
  for (const item of input) {
    const key = String(item || '').trim().toLowerCase();
    if (!key) continue;
    if (PERM_SET.has(key)) {
      if (!seenValid.has(key)) {
        seenValid.add(key);
        valid.push(key);
      }
      continue;
    }
    if (!seenUnknown.has(key)) {
      seenUnknown.add(key);
      unknown.push(key);
    }
  }
  return { valid, unknown };
}

/**
 * @param {string[]|unknown} raw
 * @returns {string[]}
 */
function normalizePermissionList(raw = []) {
  return splitPermissionList(raw).valid;
}

function assertKnownPermissionList(raw = []) {
  const { valid, unknown } = splitPermissionList(raw);
  if (unknown.length) {
    const err = new Error(`Permission không hợp lệ: ${unknown.join(', ')}`);
    err.statusCode = 400;
    err.errorCode = 'PROJECT_PERMISSION_UNKNOWN';
    err.details = { unknown, valid };
    throw err;
  }
  return valid;
}

function defaultPermissionsForRoleKey(roleKey) {
  const raw = String(roleKey || '').trim().toLowerCase();
  const key = resolveCanonicalProjectRoleKey(raw) || raw;
  const list = DEFAULT_PERMISSIONS_BY_ROLE_KEY[key] || DEFAULT_PERMISSIONS_BY_ROLE_KEY[raw];
  if (list) return normalizePermissionList(list);
  return normalizePermissionList(VIEW_ONLY);
}

/** Seed create/clone/reset: ưu tiên list đã có; rỗng → CODE_DEFAULT. */
function seedPermissionsForRoleKey(roleKey, preferred) {
  const pref = normalizePermissionList(preferred);
  if (pref.length) return pref;
  return defaultPermissionsForRoleKey(roleKey);
}

/**
 * SoT runtime = doc.permissions (Admin org hoặc PO project clone).
 * Doc rỗng / thiếu → CODE_DEFAULT.
 * Doc đã hydrate → list đó cho phép revoke các key không-SoD.
 * SoD locked keys (vd. planning:pm_review trên project_manager) luôn ∪ vào kết quả —
 * khớp PATCH applySodLockedPermissions: khoá cổng không revoke được, kể cả doc seed cũ thiếu key.
 * @param {{ key?: string, permissions?: string[] }} role
 */
function effectivePermissionsFromRoleDoc(role) {
  const docPerms = normalizePermissionList(role?.permissions);
  const base = docPerms.length > 0 ? docPerms : defaultPermissionsForRoleKey(role?.key);
  const locked = sodLockedPermissionsForRoleKey(role?.key);
  if (!locked.length) return base;
  const set = new Set(base);
  for (const p of locked) set.add(p);
  return [...set];
}

/**
 * Union permissions from multiple role docs (SoT = từng doc, không ∪ CODE_DEFAULT khi đã hydrate).
 * @param {Array<{ key?: string, permissions?: string[] }>} roles
 */
function unionPermissionsFromRoles(roles = []) {
  const set = new Set();
  for (const role of Array.isArray(roles) ? roles : []) {
    for (const p of effectivePermissionsFromRoleDoc(role)) set.add(p);
  }
  return [...set];
}

/**
 * SoD / matrix path — cùng SoT với union (doc.permissions).
 * Khoá SoD bắt buộc khi PATCH qua applySodLockedPermissions.
 * @param {Array<{ key?: string, permissions?: string[] }>} roles
 * @returns {string[]}
 */
function matrixPermissionsFromRoleKeys(roles = []) {
  return unionPermissionsFromRoles(roles);
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
  // Mỗi capability = đúng 1 permission key (không OR chéo domain).
  const canManageMembers = hasPermission(set, 'members:manage');
  return {
    canView: hasPermission(set, 'project:view'),
    canManageBoard: hasPermission(set, 'board:admin'),
    canManageLists: hasPermission(set, 'board:manage_lists'),
    canCreateCards: hasPermission(set, 'task:create'),
    canEditCards: hasPermission(set, 'task:update'),
    canAssign: hasPermission(set, 'task:assign'),
    canMoveCards: hasPermission(set, 'task:change_status'),
    canMoveToDone: hasPermission(set, 'task:drag_to_done'),
    canChangeStatus: hasPermission(set, 'task:change_status'),
    canUseAiConfirm: hasPermission(set, 'task:ai_confirm'),
    canManageMembers,
    canViewMembers: hasPermission(set, 'members:view'),
    canUpdateSettings: hasPermission(set, 'settings:update'),
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

/**
 * SoD keys không được gỡ khỏi role tương ứng (PATCH Admin/PO).
 * Chỉ force-add nếu key thuộc CODE_DEFAULT của role đó.
 */
const SOD_LOCKED_BY_ROLE_KEY = Object.freeze({
  business_analyst: Object.freeze([
    'analysis:ba_review',
    'analysis:submit_ba_review',
    'analysis:document_upload',
    'analysis:artifact_import',
    'analysis:artifact_edit',
  ]),
  product_owner: Object.freeze([
    'analysis:po_review',
    'planning:po_review',
    'handover:accept',
    'uat:sign_off',
  ]),
  project_manager: Object.freeze([
    'planning:pm_review',
    'planning:artifact_edit',
    'planning:cut_baseline',
    'planning:publish_wbs',
  ]),
  technical_lead: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  tech_lead: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  solution_architect: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
  architect: Object.freeze(['analysis:tech_review', 'planning:tech_review']),
});

function sodLockedPermissionsForRoleKey(roleKey) {
  const raw = String(roleKey || '').trim().toLowerCase();
  const key = resolveCanonicalProjectRoleKey(raw) || raw;
  const locked = SOD_LOCKED_BY_ROLE_KEY[key] || SOD_LOCKED_BY_ROLE_KEY[raw] || [];
  if (!locked.length) return [];
  const baseline = new Set(defaultPermissionsForRoleKey(key));
  return locked.filter((p) => baseline.has(p));
}

/** PATCH permissions: giữ SoD locked keys của role (không cho revoke). */
function applySodLockedPermissions(roleKey, permissions = []) {
  const set = new Set(assertKnownPermissionList(permissions));
  for (const p of sodLockedPermissionsForRoleKey(roleKey)) set.add(p);
  return [...set];
}

module.exports = {
  PROJECT_PERMISSION_KEYS,
  DEFAULT_PERMISSIONS_BY_ROLE_KEY,
  SOD_LOCKED_BY_ROLE_KEY,
  VIEW_ONLY,
  PO_PERMS,
  BA_PERMS,
  SM_PERMS,
  PM_PERMS,
  DEV_PERMS,
  QA_PERMS,
  isProjectRbacV2Enabled,
  normalizePermissionList,
  splitPermissionList,
  assertKnownPermissionList,
  defaultPermissionsForRoleKey,
  seedPermissionsForRoleKey,
  effectivePermissionsFromRoleDoc,
  unionPermissionsFromRoles,
  matrixPermissionsFromRoleKeys,
  sodLockedPermissionsForRoleKey,
  applySodLockedPermissions,
  hasPermission,
  permissionsToBoardCapabilities,
  applyInformationLevelToPermissions,
  assertPermission,
};
