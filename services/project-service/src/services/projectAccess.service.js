const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const TaskBoard = require('../models/TaskBoard');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const { createTtlCoalesceCache } = require('../utils/ttlCoalesceCache');
const {
  isProjectRbacV2Enabled,
  unionPermissionsFromRoles,
  matrixPermissionsFromRoleKeys,
  applyInformationLevelToPermissions,
  permissionsToBoardCapabilities,
  hasPermission,
  assertPermission,
  normalizePermissionList,
  PROJECT_PERMISSION_KEYS,
  VIEW_ONLY,
} = require('../utils/project/projectPermissionMatrix');
const { resolveProjectAccess } = require('../utils/project/projectVisibility');
const logger = require('@enterprise/shared/utils/logger');

const RESOLVE_CACHE_TTL_MS = 15_000;
const resolveCache = createTtlCoalesceCache({ ttlMs: RESOLVE_CACHE_TTL_MS });

function resolvePermissionsCacheKey({ userId, projectId, boardId } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  const pid = String(projectId || '').trim();
  if (pid) return `${uid}|p:${pid}`;
  const bid = String(boardId || '').trim();
  if (bid) return `${uid}|b:${bid}`;
  return '';
}

/**
 * Resolve effective project permissions for a user on a project (uncached).
 */
async function resolveUserProjectPermissionsUncached({ userId, projectId, boardId } = {}) {
  const uid = String(userId || '').trim();
  let project = null;
  if (projectId) {
    project = await Project.findById(projectId).lean();
  } else if (boardId) {
    const board = await TaskBoard.findById(boardId).select('projectId organizationId createdBy').lean();
    if (board?.projectId) {
      project = await Project.findById(board.projectId).lean();
      if (project && !project.createdBy && board.createdBy) {
        project = { ...project, createdBy: board.createdBy };
      }
    }
  }
  if (!project || project.isActive === false) {
    return {
      permissions: [],
      capabilities: permissionsToBoardCapabilities([]),
      isOrgAdmin: false,
      isCreator: false,
      informationLevel: 'summary',
      rbacV2: isProjectRbacV2Enabled(),
    };
  }

  const scope = await fetchTaskWorkspaceScope(uid, project.organizationId);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const isCreator = String(project.createdBy || '') === uid;

  if (!isProjectRbacV2Enabled()) {
    return {
      permissions: isOrgAdmin || isCreator ? [...PROJECT_PERMISSION_KEYS] : [],
      capabilities: permissionsToBoardCapabilities([], { isCreator, isOrgAdmin }),
      isOrgAdmin,
      isCreator,
      informationLevel: 'details',
      rbacV2: false,
      project,
      roles: [],
    };
  }

  const memberships = await ProjectMembership.find({
    projectId: project._id,
    userId: uid,
  })
    .select('projectRoleId')
    .lean();
  const hasMembership = memberships.length > 0;
  const roleIds = memberships.map((m) => m.projectRoleId).filter(Boolean);
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key permissions canAssign').lean()
    : [];

  // Org admin / creator: full permission dump for most ops, but keep roles for
  // BA-only gates (import Raw/Analysis) + viewer role badges.
  if (isOrgAdmin || isCreator) {
    return {
      permissions: [...PROJECT_PERMISSION_KEYS],
      capabilities: permissionsToBoardCapabilities([], { isCreator: true, isOrgAdmin: true }),
      isOrgAdmin,
      isCreator,
      informationLevel: 'confidential',
      rbacV2: true,
      project,
      roles,
    };
  }

  // Align with getProject: membership row ⇒ member even if role docs failed to resolve.
  let perms = unionPermissionsFromRoles(roles);
  if (hasMembership && roles.length === 0) {
    logger.warn(
      '[projectAccess] orphan membership (no resolvable roles) project=%s user=%s — VIEW_ONLY fallback',
      String(project._id),
      uid
    );
    perms = normalizePermissionList(VIEW_ONLY);
  }

  let informationLevel = 'details';
  try {
    const visibilityCtx = await fetchProjectVisibilityContext(project.organizationId, uid);
    const projectRoleKeys = roles.map((r) => String(r.key || '').trim()).filter(Boolean);
    const access = resolveProjectAccess({
      actor: {
        userId: uid,
        isOrgMember: visibilityCtx.isOrgMember,
        membershipRole: visibilityCtx.membershipRole,
        organizationRoleKeys: visibilityCtx.organizationRoleKeys,
        headedDepartmentIds: visibilityCtx.headedDepartmentIds,
        memberDepartmentIds: visibilityCtx.memberDepartmentIds,
      },
      project,
      membership: {
        isMember: hasMembership || roles.length > 0,
        projectRoleKeys,
      },
      orgPolicy: visibilityCtx.policy,
    });
    informationLevel = access.informationLevel || 'details';
    perms = applyInformationLevelToPermissions(perms, informationLevel);
  } catch {
    /* keep details */
  }

  return {
    permissions: normalizePermissionList(perms),
    capabilities: permissionsToBoardCapabilities(perms, { isCreator, isOrgAdmin }),
    isOrgAdmin,
    isCreator,
    informationLevel,
    rbacV2: true,
    project,
    roles,
  };
}

/**
 * Resolve effective project permissions for a user on a project.
 * Process-local TTL + in-flight coalesce (key prefers projectId).
 */
async function resolveUserProjectPermissions(opts = {}) {
  const key = resolvePermissionsCacheKey(opts);
  if (!key) return resolveUserProjectPermissionsUncached(opts);
  return resolveCache.getOrLoad(key, () => resolveUserProjectPermissionsUncached(opts));
}

async function assertUserProjectPermission({ userId, projectId, boardId, permission, message }) {
  const resolved = await resolveUserProjectPermissions({ userId, projectId, boardId });
  if (resolved.isOrgAdmin || resolved.isCreator) return resolved;
  assertPermission(resolved.permissions, permission, message);
  return resolved;
}

/**
 * BA-only ops (Raw/Analysis import): matrix theo role key hiện tại —
 * bỏ qua permissions array seed cũ trên ProjectRole doc; không creator/org-admin bypass.
 */
async function assertUserProjectRoleMatrixPermission({
  userId,
  projectId,
  boardId,
  permission,
  message,
}) {
  const resolved = await resolveUserProjectPermissions({ userId, projectId, boardId });
  const rolePerms = matrixPermissionsFromRoleKeys(resolved.roles || []);
  assertPermission(rolePerms, permission, message || `Thiếu quyền ${permission}`);
  return resolved;
}

/**
 * Cho phép một trong các key (vd. sprint:start fallback sprint:create).
 */
async function assertUserAnyProjectPermission({
  userId,
  projectId,
  boardId,
  permissions = [],
  message,
} = {}) {
  const resolved = await resolveUserProjectPermissions({ userId, projectId, boardId });
  if (resolved.isOrgAdmin || resolved.isCreator) return resolved;
  const keys = (Array.isArray(permissions) ? permissions : [permissions])
    .map((k) => String(k || '').trim())
    .filter(Boolean);
  if (keys.some((k) => hasPermission(resolved.permissions, k))) return resolved;
  assertPermission(resolved.permissions, keys[0] || 'project:view', message);
  return resolved;
}

function _clearResolveUserProjectPermissionsCacheForTests() {
  resolveCache.clear();
}

/** Clear all resolve entries (org-default role permission updates affect many projects). */
function clearResolveUserProjectPermissionsCache() {
  resolveCache.clear();
}

function _setResolveUserProjectPermissionsCacheTtlForTests(ttlMs) {
  resolveCache.setTtlMs(ttlMs);
}

/** Invalidate all resolve entries for a project (and board keys for that project are harder — clear by projectId suffix). */
function invalidateResolveCacheForProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return;
  resolveCache.invalidateWhere((k) => k.includes(`|p:${pid}`));
}

module.exports = {
  resolveUserProjectPermissions,
  assertUserProjectPermission,
  assertUserProjectRoleMatrixPermission,
  assertUserAnyProjectPermission,
  hasPermission,
  invalidateResolveCacheForProject,
  clearResolveUserProjectPermissionsCache,
  _clearResolveUserProjectPermissionsCacheForTests,
  _setResolveUserProjectPermissionsCacheTtlForTests,
};
