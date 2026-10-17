const rbacService = require('../services/rbac.service');
const { logger } = require('@enterprise/shared');
const { sendErrorFromCatch } = require('../middleware/sendServiceError');

const sendError = sendErrorFromCatch;

function actorUserId(req) {
  return req.user?.id || req.user?.userId || req.userContext?.userId || null;
}

class RbacController {
  /** @deprecated Prefer listSystemPermissions */
  async getCatalog(req, res) {
    return this.listSystemPermissions(req, res);
  }

  async listSystemPermissions(req, res) {
    try {
      const data = await rbacService.listSystemPermissions();
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC listSystemPermissions error:', error);
      return sendError(res, error, 500, 'Không thể tải danh sách quyền hệ thống', 'RBAC_PERMISSIONS_FAILED');
    }
  }

  async listGroups(req, res) {
    try {
      const organizationId =
        req.query.organizationId || req.query.serverId || req.resolvedOrganizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organizationId is required',
        });
      }
      const data = await rbacService.listOrganizationGroups({ organizationId });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC listGroups error:', error);
      return sendError(res, error, 500, 'Không thể tải Permission Groups', 'RBAC_GROUP_LIST_FAILED');
    }
  }

  async cloneGroup(req, res) {
    try {
      const {
        organizationId,
        serverId,
        templateKey,
        specialization,
        allowOtherName,
        otherName,
        createRole,
        priority,
        color,
        description,
      } = req.body || {};
      const oid = organizationId || serverId || req.resolvedOrganizationId;
      if (!oid || !templateKey) {
        return res.status(400).json({
          success: false,
          message: 'organizationId and templateKey are required',
        });
      }

      const group = await rbacService.cloneTemplate({
        organizationId: oid,
        templateKey,
        specialization,
        allowOtherName,
        otherName,
        actorUserId: actorUserId(req),
      });

      let role = null;
      if (createRole !== false) {
        const Role = require('../models/Role');
        const { materializeLegacyPermissions } = require('../config/rbacPermissions');
        const permissions = materializeLegacyPermissions(group.grants);
        if (!permissions.some((p) => p.resource === 'role' && (p.actions || []).includes('read'))) {
          permissions.push({ resource: 'role', actions: ['read'] });
        }
        role = await Role.create({
          name: group.name,
          description: description != null ? String(description).trim() : `RBAC · ${group.templateKey}`,
          scope: 'ORGANIZATION',
          serverId: oid,
          organizationId: oid,
          permissions,
          color: color || '#6366f1',
          isDefault: false,
          priority: Number(priority) || 50,
          isActive: true,
        });
        await rbacService.assignGroupToRole({
          organizationId: oid,
          roleId: role._id,
          permissionGroupId: group._id,
          roleLayer: 'organization',
          actorUserId: actorUserId(req),
        });
        role = role.toObject();
      }

      return res.status(201).json({ success: true, data: { group, role } });
    } catch (error) {
      logger.error('RBAC cloneGroup error:', error);
      return sendError(res, error, 400, 'Không thể clone Permission Group', 'RBAC_CLONE_FAILED');
    }
  }

  async renameGroup(req, res) {
    try {
      const groupId = req.params.groupId;
      const {
        organizationId,
        serverId,
        specialization,
        allowOtherName,
        otherName,
      } = req.body || {};
      const oid = organizationId || serverId || req.resolvedOrganizationId;
      if (!oid) {
        return res.status(400).json({ success: false, message: 'organizationId is required' });
      }
      const data = await rbacService.renameOrganizationGroup({
        organizationId: oid,
        groupId,
        specialization,
        allowOtherName,
        otherName,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC renameGroup error:', error);
      return sendError(res, error, 400, 'Không thể đổi tên Permission Group', 'RBAC_RENAME_FAILED');
    }
  }

  async setGroupGrants(req, res) {
    try {
      const groupId = req.params.groupId;
      const { organizationId, serverId, grants } = req.body || {};
      const oid = organizationId || serverId || req.resolvedOrganizationId;
      if (!oid) {
        return res.status(400).json({ success: false, message: 'organizationId is required' });
      }
      const data = await rbacService.setOrganizationGroupGrants({
        organizationId: oid,
        groupId,
        grants,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC setGroupGrants error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật grants', 'RBAC_GRANTS_FAILED');
    }
  }

  async listRoleGroups(req, res) {
    try {
      const { roleId } = req.params;
      const organizationId =
        req.query.organizationId || req.query.serverId || req.resolvedOrganizationId;
      if (!organizationId) {
        return res.status(400).json({ success: false, message: 'organizationId is required' });
      }
      const bindings = await rbacService.listRoleBindings({ organizationId, roleId });
      const groups = await rbacService.listOrganizationGroups({ organizationId });
      const byId = new Map(groups.map((g) => [String(g._id), g]));
      const data = bindings.map((b) => ({
        ...b,
        group: byId.get(String(b.permissionGroupId)) || null,
      }));
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC listRoleGroups error:', error);
      return sendError(res, error, 500, 'Không thể tải group bindings', 'RBAC_ROLE_GROUPS_FAILED');
    }
  }

  async replaceRoleGroups(req, res) {
    try {
      const { roleId } = req.params;
      const {
        organizationId,
        serverId,
        permissionGroupIds,
        roleLayer,
      } = req.body || {};
      const oid = organizationId || serverId || req.resolvedOrganizationId;
      if (!oid) {
        return res.status(400).json({ success: false, message: 'organizationId is required' });
      }
      const data = await rbacService.replaceRoleGroups({
        organizationId: oid,
        roleId,
        permissionGroupIds,
        roleLayer,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC replaceRoleGroups error:', error);
      return sendError(res, error, 400, 'Không thể gán Permission Groups', 'RBAC_ASSIGN_FAILED');
    }
  }

  async directReplace(req, res) {
    try {
      const organizationId =
        req.body?.organizationId || req.body?.serverId || req.resolvedOrganizationId;
      if (!organizationId) {
        return res.status(400).json({ success: false, message: 'organizationId is required' });
      }
      const data = await rbacService.directReplaceOrganization({
        organizationId,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC directReplace error:', error);
      return sendError(res, error, 500, 'Direct replace thất bại', 'RBAC_DIRECT_REPLACE_FAILED');
    }
  }

  /** S2S — Wave B create-project migration */
  async ensureProjectCreateGrant(req, res) {
    try {
      const userId = req.body?.userId;
      const organizationId = req.body?.organizationId || req.body?.serverId;
      if (!userId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: 'userId and organizationId are required',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }
      const data = await rbacService.ensureProjectCreateGrant({
        userId,
        organizationId,
        actorUserId: actorUserId(req) || userId,
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC ensureProjectCreateGrant error:', error);
      return sendError(
        res,
        error,
        500,
        'Không thể đảm bảo quyền tạo dự án',
        'MIGRATION_BIND_FAILED'
      );
    }
  }
}

module.exports = new RbacController();
