const Project = require('../models/Project');
const ProjectRole = require('../models/ProjectRole');
const {
  listProjectRolesCached,
  getRoleByKey,
  invalidateProjectRolesListCache,
} = require('../services/projectTeam.service');
const {
  resolveUserProjectPermissions,
  invalidateResolveCacheForProject,
} = require('../services/projectAccess.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');
const { normalizeLayerLabel } = require('@enterprise/shared/utils/roleLayerNaming');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

async function loadProjectOr404(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) {
    const err = Object.assign(new Error('projectId bắt buộc'), {
      statusCode: 400,
      errorCode: 'VALIDATION_REQUIRED',
    });
    throw err;
  }
  const project = await Project.findById(pid).lean();
  if (!project || project.isActive === false) {
    const err = Object.assign(new Error('Project không tồn tại'), {
      statusCode: 404,
      errorCode: 'PROJECT_NOT_FOUND',
    });
    throw err;
  }
  return project;
}

async function assertCanViewProjectRoles({ userId, project }) {
  const resolved = await resolveUserProjectPermissions({
    userId,
    projectId: project._id,
  });
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  if (
    resolved.isOrgAdmin ||
    resolved.isCreator ||
    hasPermission(resolved.permissions, 'settings:view') ||
    hasPermission(resolved.permissions, 'members:view') ||
    hasPermission(resolved.permissions, 'project:view')
  ) {
    return resolved;
  }
  const err = Object.assign(new Error('Forbidden'), {
    statusCode: 403,
    errorCode: 'PROJECT_ACCESS_DENIED',
  });
  throw err;
}

async function assertCanUpdateProjectRoles({ userId, project }) {
  const resolved = await resolveUserProjectPermissions({
    userId,
    projectId: project._id,
  });
  const { hasPermission } = require('../utils/project/projectPermissionMatrix');
  if (
    resolved.isOrgAdmin ||
    resolved.isCreator ||
    hasPermission(resolved.permissions, 'settings:update')
  ) {
    return resolved;
  }
  const err = Object.assign(new Error('Không có quyền sửa quyền Project Role (settings:update)'), {
    statusCode: 403,
    errorCode: 'PROJECT_ACCESS_DENIED',
  });
  throw err;
}

function invalidateProjectRoleCaches(projectId) {
  invalidateProjectRolesListCache(projectId);
  invalidateResolveCacheForProject(projectId);
}

async function listProjectScopedRoles(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Unauthorized',
        message: 'no token',
      });
    }
    const project = await loadProjectOr404(req.params.projectId);
    await assertCanViewProjectRoles({ userId, project });
    const roles = await listProjectRolesCached(project._id, project.organizationId);
    return res.json({ success: true, data: roles });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'PROJECT_SCOPED_ROLE_LIST_FAILED'
    );
  }
}

async function updateProjectScopedRole(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Unauthorized',
        message: 'no token',
      });
    }
    const project = await loadProjectOr404(req.params.projectId);
    await assertCanUpdateProjectRoles({ userId, project });

    const roleId = String(req.params.roleId || '').trim();
    const { label, canAssign, permissions } = req.body || {};
    if (!roleId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'roleId bắt buộc.',
        message: 'roleId required',
      });
    }

    const role = await ProjectRole.findOne({
      _id: roleId,
      projectId: project._id,
    }).lean();
    if (!role) {
      return sendServiceError(res, 404, {
        errorCode: 'PROJECT_ROLE_NOT_FOUND',
        messageUser: 'Không tìm thấy project role trên dự án này.',
        message: 'not found',
      });
    }

    const patch = {};
    if (label !== undefined) {
      const l = String(label || '').trim();
      if (!l) {
        return sendServiceError(res, 400, {
          errorCode: 'VALIDATION_REQUIRED',
          messageUser: 'label không hợp lệ.',
          message: 'invalid label',
        });
      }
      patch.label = normalizeLayerLabel(l, 'project');
    }
    if (canAssign !== undefined) patch.canAssign = Boolean(canAssign);
    if (permissions !== undefined) {
      const { assertKnownPermissionList } = require('../utils/project/projectPermissionMatrix');
      patch.permissions = assertKnownPermissionList(permissions);
    }

    if (!Object.keys(patch).length) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'Không có field hợp lệ để cập nhật.',
        message: 'empty patch',
      });
    }

    const updated = await ProjectRole.findOneAndUpdate(
      { _id: role._id, projectId: project._id },
      { $set: patch },
      { new: true }
    ).lean();

    invalidateProjectRoleCaches(project._id);

    try {
      const auditService = require('../services/audit.service');
      await auditService.recordMutationAudit({
        organizationId: project.organizationId,
        actorUserId: userId,
        action: 'project_scoped_role.updated',
        resourceType: 'project_role',
        resourceId: String(role._id),
        beforeDoc: role,
        afterDoc: updated,
        keys: ['key', 'label', 'canAssign', 'permissions', 'sortOrder'],
        requestId: req.headers['x-request-id'] || '',
        meta: { roleKey: role.key, projectId: String(project._id), scope: 'project' },
      });
    } catch {
      /* best-effort */
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'PROJECT_SCOPED_ROLE_UPDATE_FAILED'
    );
  }
}

async function resetProjectScopedRoleDefault(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Unauthorized',
        message: 'no token',
      });
    }
    const project = await loadProjectOr404(req.params.projectId);
    await assertCanUpdateProjectRoles({ userId, project });

    const roleId = String(req.params.roleId || '').trim();
    if (!roleId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'roleId bắt buộc.',
        message: 'roleId required',
      });
    }

    const role = await ProjectRole.findOne({
      _id: roleId,
      projectId: project._id,
    }).lean();
    if (!role) {
      return sendServiceError(res, 404, {
        errorCode: 'PROJECT_ROLE_NOT_FOUND',
        messageUser: 'Không tìm thấy project role trên dự án này.',
        message: 'not found',
      });
    }

    const orgDefault = await getRoleByKey(project.organizationId, role.key);
    if (!orgDefault) {
      return sendServiceError(res, 404, {
        errorCode: 'PROJECT_ROLE_DEFAULT_NOT_FOUND',
        messageUser: 'Không tìm thấy quyền mặc định org cho role này.',
        message: 'org default missing',
      });
    }

    const updated = await ProjectRole.findOneAndUpdate(
      { _id: role._id, projectId: project._id },
      {
        $set: {
          label: orgDefault.label,
          canAssign: Boolean(orgDefault.canAssign),
          permissions: Array.isArray(orgDefault.permissions) ? [...orgDefault.permissions] : [],
          sortOrder: Number(orgDefault.sortOrder) || role.sortOrder,
        },
      },
      { new: true }
    ).lean();

    invalidateProjectRoleCaches(project._id);

    return res.json({ success: true, data: updated });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'PROJECT_SCOPED_ROLE_RESET_FAILED'
    );
  }
}

module.exports = {
  listProjectScopedRoles,
  updateProjectScopedRole,
  resetProjectScopedRoleDefault,
};
