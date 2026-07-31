const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const TaskBoard = require('../models/TaskBoard');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const {
  isProjectRbacV2Enabled,
  unionPermissionsFromRoles,
  applyInformationLevelToPermissions,
  permissionsToBoardCapabilities,
  hasPermission,
  assertPermission,
  normalizePermissionList,
  PROJECT_PERMISSION_KEYS,
} = require('../utils/projectPermissionMatrix');
const { resolveProjectAccess } = require('../utils/projectVisibility');

/**
 * Resolve effective project permissions for a user on a project.
 */
async function resolveUserProjectPermissions({ userId, projectId, boardId } = {}) {
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
    };
  }

  if (isOrgAdmin || isCreator) {
    return {
      permissions: [...PROJECT_PERMISSION_KEYS],
      capabilities: permissionsToBoardCapabilities([], { isCreator: true, isOrgAdmin: true }),
      isOrgAdmin,
      isCreator,
      informationLevel: 'confidential',
      rbacV2: true,
      project,
    };
  }

  const memberships = await ProjectMembership.find({
    projectId: project._id,
    userId: uid,
  })
    .select('projectRoleId')
    .lean();
  const roleIds = memberships.map((m) => m.projectRoleId).filter(Boolean);
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key permissions canAssign').lean()
    : [];

  let perms = unionPermissionsFromRoles(roles);

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
        isMember: roles.length > 0,
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

async function assertUserProjectPermission({ userId, projectId, boardId, permission, message }) {
  const resolved = await resolveUserProjectPermissions({ userId, projectId, boardId });
  assertPermission(resolved.permissions, permission, message);
  return resolved;
}

module.exports = {
  resolveUserProjectPermissions,
  assertUserProjectPermission,
  hasPermission,
};
