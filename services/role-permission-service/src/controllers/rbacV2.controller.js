const rbacV2Service = require('../services/rbacV2.service');
const { logger } = require('@enterprise/shared');

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const status = Number(err?.statusCode) || fallbackStatus;
  const message = String(err?.message || fallbackMessage);
  const errorCode = String(err?.errorCode || fallbackCode || '').trim();
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

function actorUserId(req) {
  return req.user?.id || req.user?.userId || req.userContext?.userId || null;
}

class RbacV2Controller {
  async getCatalog(req, res) {
    try {
      const data = await rbacV2Service.getCatalog();
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 getCatalog error:', error);
      return sendError(res, error, 500, 'Không thể tải catalog RBAC V2', 'RBAC_CATALOG_FAILED');
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
      const data = await rbacV2Service.listOrganizationGroups({ organizationId });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 listGroups error:', error);
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

      const group = await rbacV2Service.cloneTemplate({
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
        const { materializeLegacyPermissions } = require('../config/rbacV2Catalog');
        const permissions = materializeLegacyPermissions(group.grants);
        if (!permissions.some((p) => p.resource === 'role' && (p.actions || []).includes('read'))) {
          permissions.push({ resource: 'role', actions: ['read'] });
        }
        role = await Role.create({
          name: group.name,
          description: description != null ? String(description).trim() : `RBAC V2 · ${group.templateKey}`,
          scope: 'ORGANIZATION',
          serverId: oid,
          organizationId: oid,
          permissions,
          color: color || '#6366f1',
          isDefault: false,
          priority: Number(priority) || 50,
          isActive: true,
        });
        await rbacV2Service.assignGroupToRole({
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
      logger.error('RBAC V2 cloneGroup error:', error);
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
      const data = await rbacV2Service.renameOrganizationGroup({
        organizationId: oid,
        groupId,
        specialization,
        allowOtherName,
        otherName,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 renameGroup error:', error);
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
      const data = await rbacV2Service.setOrganizationGroupGrants({
        organizationId: oid,
        groupId,
        grants,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 setGroupGrants error:', error);
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
      const bindings = await rbacV2Service.listRoleBindings({ organizationId, roleId });
      const groups = await rbacV2Service.listOrganizationGroups({ organizationId });
      const byId = new Map(groups.map((g) => [String(g._id), g]));
      const data = bindings.map((b) => ({
        ...b,
        group: byId.get(String(b.permissionGroupId)) || null,
      }));
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 listRoleGroups error:', error);
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
      const data = await rbacV2Service.replaceRoleGroups({
        organizationId: oid,
        roleId,
        permissionGroupIds,
        roleLayer,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 replaceRoleGroups error:', error);
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
      const data = await rbacV2Service.directReplaceOrganization({
        organizationId,
        actorUserId: actorUserId(req),
      });
      return res.json({ success: true, data });
    } catch (error) {
      logger.error('RBAC V2 directReplace error:', error);
      return sendError(res, error, 500, 'Direct replace thất bại', 'RBAC_DIRECT_REPLACE_FAILED');
    }
  }
}

module.exports = new RbacV2Controller();
