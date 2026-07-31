const ProjectRole = require('../models/ProjectRole');
const ProjectMembership = require('../models/ProjectMembership');
const { fetchTaskWorkspaceScope } = require('../services/taskWorkspaceScope');
const { ensureOrgProjectRoles } = require('../services/projectTeam.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function asOrgId(req) {
  return String(req.headers['x-organization-id'] || req.headers['x-organizationid'] || req.body?.organizationId || '')
    .trim();
}

function isOrgOwnerAdmin(membershipRole) {
  const r = String(membershipRole || '').toLowerCase();
  return r === 'owner' || r === 'admin';
}

async function requireOrgAdmin(req) {
  const userId = asUserId(req);
  const orgId = asOrgId(req);
  if (!userId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401, errorCode: 'AUTH_NO_TOKEN' });
  }
  if (!orgId) {
    throw Object.assign(new Error('organizationId bắt buộc'), { statusCode: 400, errorCode: 'VALIDATION_REQUIRED' });
  }

  const scope = await fetchTaskWorkspaceScope(userId, orgId);
  const membershipRole = scope?.membershipRole;
  if (!scope || !isOrgOwnerAdmin(membershipRole)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403, errorCode: 'ORG_ACCESS_DENIED' });
  }
  return { userId, orgId };
}

async function listProjectRoles(req, res) {
  try {
    const { orgId } = await requireOrgAdmin(req);
    const roles = await ensureOrgProjectRoles(orgId);
    return res.json({ success: true, data: roles });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_LIST_FAILED');
  }
}

async function createProjectRole(req, res) {
  try {
    const { orgId } = await requireOrgAdmin(req);
    const { key, label, canAssign = false, sortOrder } = req.body || {};

    const k = String(key || '').trim();
    const l = String(label || '').trim();
    if (!k || !l) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'Key và label là bắt buộc.',
        message: 'key and label required',
      });
    }

    const existing = await ProjectRole.findOne({ organizationId: orgId, key: k }).lean();
    if (existing) {
      return sendServiceError(res, 409, {
        errorCode: 'PROJECT_ROLE_KEY_EXISTS',
        messageUser: 'Project role key đã tồn tại.',
        message: 'key exists',
      });
    }

    const role = await ProjectRole.create({
      organizationId: orgId,
      key: k,
      label: l,
      canAssign: Boolean(canAssign),
      isSystem: false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 100,
    });

    return res.status(201).json({ success: true, data: role.toObject() });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_CREATE_FAILED');
  }
}

async function updateProjectRole(req, res) {
  try {
    const { orgId } = await requireOrgAdmin(req);
    const roleId = String(req.params.roleId || '').trim();
    const { label, canAssign, sortOrder } = req.body || {};

    if (!roleId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'roleId bắt buộc.',
        message: 'roleId required',
      });
    }

    const role = await ProjectRole.findOne({ _id: roleId, organizationId: orgId }).lean();
    if (!role) {
      return sendServiceError(res, 404, {
        errorCode: 'PROJECT_ROLE_NOT_FOUND',
        messageUser: 'Không tìm thấy project role.',
        message: 'not found',
      });
    }
    if (role.isSystem) {
      return sendServiceError(res, 409, {
        errorCode: 'PROJECT_ROLE_SYSTEM',
        messageUser: 'Không thể sửa project role mặc định.',
        message: 'system role',
      });
    }

    const patch = {};
    if (label !== undefined) {
      const l = String(label || '').trim();
      if (!l) throw Object.assign(new Error('label không hợp lệ'), { statusCode: 400, errorCode: 'VALIDATION_REQUIRED' });
      patch.label = l;
    }
    if (canAssign !== undefined) patch.canAssign = Boolean(canAssign);
    if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);

    const updated = await ProjectRole.findOneAndUpdate({ _id: role._id }, { $set: patch }, { new: true }).lean();
    return res.json({ success: true, data: updated });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_UPDATE_FAILED');
  }
}

async function deleteProjectRole(req, res) {
  try {
    const { orgId } = await requireOrgAdmin(req);
    const roleId = String(req.params.roleId || '').trim();
    if (!roleId) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'roleId bắt buộc.',
        message: 'roleId required',
      });
    }

    const role = await ProjectRole.findOne({ _id: roleId, organizationId: orgId }).lean();
    if (!role) {
      return sendServiceError(res, 404, {
        errorCode: 'PROJECT_ROLE_NOT_FOUND',
        messageUser: 'Không tìm thấy project role.',
        message: 'not found',
      });
    }
    if (role.isSystem) {
      return sendServiceError(res, 409, {
        errorCode: 'PROJECT_ROLE_SYSTEM',
        messageUser: 'Không thể xóa project role mặc định.',
        message: 'system role',
      });
    }

    const inUseCount = await ProjectMembership.countDocuments({ organizationId: orgId, projectRoleId: role._id });
    if (inUseCount > 0) {
      return sendServiceError(res, 409, {
        errorCode: 'PROJECT_ROLE_IN_USE',
        messageUser: 'Project role đang được dùng trên board, không thể xóa.',
        message: 'in use',
      });
    }

    await ProjectRole.deleteOne({ _id: role._id });
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_DELETE_FAILED');
  }
}

module.exports = {
  listProjectRoles,
  createProjectRole,
  updateProjectRole,
  deleteProjectRole,
};

