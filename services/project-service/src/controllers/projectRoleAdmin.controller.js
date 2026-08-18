const ProjectRole = require('../models/ProjectRole');
const ProjectMembership = require('../models/ProjectMembership');
const { fetchTaskWorkspaceScope } = require('../services/taskWorkspaceScope');
const { ensureOrgProjectRoles } = require('../services/projectTeam.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');
const { allocateUniqueRoleKey, ensureRoleKeyNamespace } = require('@enterprise/shared/utils/roleKeySlug');
const {
  normalizeLayerLabel,
  splitLayerLabel,
} = require('@enterprise/shared/utils/roleLayerNaming');
const {
  sortOrderFromIndex,
  nextAppendSortOrder,
  validateOrderedIdsPermutation,
  insertIdAtPlace,
} = require('@enterprise/shared/utils/catalogSortOrder');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function asOrgId(req) {
  return String(
    req.headers['x-organization-id'] ||
      req.headers['x-organizationid'] ||
      req.query?.organizationId ||
      req.body?.organizationId ||
      ''
  ).trim();
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
    const sorted = [...roles].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    return res.json({ success: true, data: sorted });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_LIST_FAILED');
  }
}

const { isMasterDataV1Enabled } = require('@enterprise/shared/config/masterData');

async function createProjectRole(req, res) {
  try {
    if (isMasterDataV1Enabled()) {
      return sendServiceError(res, 403, {
        errorCode: 'MASTER_DATA_CUSTOM_ROLE_BLOCKED',
        messageUser: 'Không thể tạo Project Role tùy chỉnh. Chỉ bật/tắt catalog hệ thống.',
        message: 'custom project role creation blocked',
      });
    }
    const { orgId } = await requireOrgAdmin(req);
    const { key, label, canAssign = false, place, afterRoleId, permissions } = req.body || {};

    const l = String(label || '').trim();
    if (!l) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'Label là bắt buộc.',
        message: 'label required',
      });
    }

    await ensureOrgProjectRoles(orgId);
    const existingRows = await ProjectRole.find({ organizationId: orgId })
      .select('_id key sortOrder')
      .sort({ sortOrder: 1 })
      .lean();
    const existingKeys = existingRows.map((r) => r.key);
    const normalizedLabel = normalizeLayerLabel(l, 'project');
    const { suffix } = splitLayerLabel(normalizedLabel, 'project');
    const rawKey = String(key || '').trim();
    const base = ensureRoleKeyNamespace(rawKey || suffix || normalizedLabel, 'prj');
    const k = allocateUniqueRoleKey(base, existingKeys);

    const {
      assertKnownPermissionList,
      defaultPermissionsForRoleKey,
    } = require('../utils/projectPermissionMatrix');
    const permList =
      permissions !== undefined
        ? assertKnownPermissionList(permissions)
        : defaultPermissionsForRoleKey('watcher');

    const role = await ProjectRole.create({
      organizationId: orgId,
      key: k,
      label: normalizedLabel,
      canAssign: Boolean(canAssign),
      permissions: permList,
      isSystem: false,
      sortOrder: nextAppendSortOrder(existingRows),
    });

    const orderedIds = insertIdAtPlace(
      existingRows.map((r) => String(r._id)),
      String(role._id),
      { place: place || 'end', afterRoleId }
    );
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, organizationId: orgId },
        update: { $set: { sortOrder: sortOrderFromIndex(index) } },
      },
    }));
    if (ops.length) await ProjectRole.bulkWrite(ops);

    const refreshed = await ProjectRole.findById(role._id).lean();
    return res.status(201).json({ success: true, data: refreshed });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_CREATE_FAILED');
  }
}

async function updateProjectRole(req, res) {
  try {
    const { orgId, userId } = await requireOrgAdmin(req);
    const roleId = String(req.params.roleId || '').trim();
    const { label, canAssign, permissions } = req.body || {};

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

    const patch = {};
    if (label !== undefined || canAssign !== undefined) {
      if (role.isSystem) {
        return sendServiceError(res, 409, {
          errorCode: 'PROJECT_ROLE_SYSTEM',
          messageUser: 'Không thể sửa label/canAssign của project role mặc định. Có thể sửa permissions.',
          message: 'system role',
        });
      }
      if (label !== undefined) {
        const l = String(label || '').trim();
        if (!l) throw Object.assign(new Error('label không hợp lệ'), { statusCode: 400, errorCode: 'VALIDATION_REQUIRED' });
        patch.label = normalizeLayerLabel(l, 'project');
      }
      if (canAssign !== undefined) patch.canAssign = Boolean(canAssign);
    }
    if (permissions !== undefined) {
      const { assertKnownPermissionList } = require('../utils/projectPermissionMatrix');
      patch.permissions = assertKnownPermissionList(permissions);
    }

    if (!Object.keys(patch).length) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'Không có field hợp lệ để cập nhật.',
        message: 'empty patch',
      });
    }

    const updated = await ProjectRole.findOneAndUpdate({ _id: role._id }, { $set: patch }, { new: true }).lean();
    try {
      const auditService = require('../services/audit.service');
      await auditService.recordMutationAudit({
        organizationId: orgId,
        actorUserId: userId,
        action: 'project_role.updated',
        resourceType: 'project_role',
        resourceId: String(role._id),
        beforeDoc: role,
        afterDoc: updated,
        keys: ['key', 'label', 'canAssign', 'permissions', 'sortOrder'],
        requestId: req.headers['x-request-id'] || '',
        meta: { roleKey: role.key },
      });
    } catch {
      /* audit best-effort */
    }
    return res.json({ success: true, data: updated });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_UPDATE_FAILED');
  }
}

async function reorderProjectRoles(req, res) {
  try {
    const { orgId } = await requireOrgAdmin(req);
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
    if (!orderedIds) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'orderedIds bắt buộc.',
        message: 'orderedIds required',
      });
    }

    await ensureOrgProjectRoles(orgId);
    const roles = await ProjectRole.find({ organizationId: orgId }).select('_id').lean();
    const existingIds = roles.map((r) => String(r._id));
    const check = validateOrderedIdsPermutation(existingIds, orderedIds);
    if (!check.ok) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: check.reason || 'orderedIds không hợp lệ.',
        message: check.reason || 'invalid orderedIds',
      });
    }

    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id, organizationId: orgId },
        update: { $set: { sortOrder: sortOrderFromIndex(index) } },
      },
    }));
    if (ops.length) await ProjectRole.bulkWrite(ops);

    const next = await ProjectRole.find({ organizationId: orgId }).sort({ sortOrder: 1 }).lean();
    return res.json({ success: true, data: next });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_REORDER_FAILED');
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
    try {
      const auditService = require('../services/audit.service');
      await auditService.recordAudit({
        organizationId: orgId,
        actorUserId: asUserId(req),
        action: 'project_role.deleted',
        resourceType: 'project_role',
        resourceId: String(role._id),
        before: { key: role.key, label: role.label, permissions: role.permissions },
        after: null,
        requestId: req.headers['x-request-id'] || '',
      });
    } catch {
      /* audit best-effort */
    }
    return res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_DELETE_FAILED');
  }
}

module.exports = {
  listProjectRoles,
  createProjectRole,
  updateProjectRole,
  reorderProjectRoles,
  deleteProjectRole,
};

