const { mongoose } = require('@enterprise/shared/config/mongo');
const PermissionGroupTemplate = require('../models/PermissionGroupTemplate');
const OrganizationPermissionGroup = require('../models/OrganizationPermissionGroup');
const RolePermissionGroupBinding = require('../models/RolePermissionGroupBinding');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const {
  CATEGORIES,
  MODULES,
  MASTER_PERMISSIONS,
  TEMPLATE_DEFINITIONS,
  SPECIALIZATIONS,
  isValidMasterPermission,
  getTemplateDefinition,
  assertCatalogIntegrity,
  materializeLegacyPermissions,
  buildCatalogTree,
} = require('../config/rbacV2Catalog');
const { membershipRoleToTemplateKey } = require('../config/rbacV2RoleTemplateMap');
const { fetchOrganizationMemberships } = require('../clients/organizationMemberships.client');
const { getRedisClient, logger } = require('@enterprise/shared');

function serviceError(message, statusCode = 400, errorCode = 'RBAC_V2_FAILED') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function asObjectId(value, fieldName) {
  const id = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw serviceError(`${fieldName} không hợp lệ`, 400, 'VALIDATION_OBJECT_ID');
  }
  return id;
}

function normalizeSpecialization(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function uniqueStrings(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).map((x) => String(x || '').trim()).filter(Boolean))];
}

function buildGroupName({ specialization, templateLabel, allowOtherName = false, otherName = '' }) {
  if (allowOtherName || String(specialization || '').trim().toLowerCase() === 'other') {
    const custom = normalizeSpecialization(otherName);
    if (!custom) {
      throw serviceError('Tên custom bắt buộc khi chọn Other', 400, 'GROUP_NAME_REQUIRED');
    }
    return custom;
  }
  const spec = normalizeSpecialization(specialization);
  if (!spec) return String(templateLabel || '').trim();
  return `${spec} ${templateLabel}`.trim();
}

async function rematerializeRolePermissions(organizationId, roleId) {
  const oid = String(organizationId);
  const rid = String(roleId);
  const bindings = await RolePermissionGroupBinding.find({
    organizationId: oid,
    roleId: rid,
    isActive: true,
  })
    .select('permissionGroupId')
    .lean();
  const groupIds = bindings.map((b) => b.permissionGroupId);
  let grants = [];
  if (groupIds.length) {
    const groups = await OrganizationPermissionGroup.find({
      _id: { $in: groupIds },
      organizationId: oid,
      isActive: true,
    })
      .select('grants')
      .lean();
    for (const g of groups) grants.push(...(g.grants || []));
  }
  grants = uniqueStrings(grants).filter(isValidMasterPermission);
  const permissions = materializeLegacyPermissions(grants);
  // Always ensure role:read for admin UI listing
  const hasRoleRead = permissions.some(
    (p) => p.resource === 'role' && (p.actions || []).includes('read')
  );
  if (!hasRoleRead) {
    permissions.push({ resource: 'role', actions: ['read'] });
  }
  await Role.updateOne({ _id: rid }, { $set: { permissions } });
  return permissions;
}

class RbacV2Service {
  async seedSystemTemplates() {
    assertCatalogIntegrity();
    for (const tpl of TEMPLATE_DEFINITIONS) {
      const grants = uniqueStrings(tpl.grants).filter(isValidMasterPermission);
      await PermissionGroupTemplate.updateOne(
        { key: tpl.key },
        {
          $set: {
            label: tpl.label,
            description: tpl.description || '',
            grants,
            isSystem: true,
            isActive: true,
          },
        },
        { upsert: true }
      );
    }
    return PermissionGroupTemplate.find({ isActive: true }).sort({ key: 1 }).lean();
  }

  async getCatalog() {
    assertCatalogIntegrity();
    const templates = await PermissionGroupTemplate.find({ isActive: true }).sort({ key: 1 }).lean();
    return {
      categories: CATEGORIES,
      modules: MODULES,
      masterPermissions: MASTER_PERMISSIONS,
      specializations: SPECIALIZATIONS,
      tree: buildCatalogTree(),
      templates:
        templates.length > 0
          ? templates
          : TEMPLATE_DEFINITIONS.map((t) => ({
              key: t.key,
              label: t.label,
              grants: t.grants,
              isSystem: true,
              isActive: true,
            })),
    };
  }

  async cloneTemplate({
    organizationId,
    templateKey,
    specialization = '',
    allowOtherName = false,
    otherName = '',
    actorUserId = null,
  }) {
    const oid = asObjectId(organizationId, 'organizationId');
    let template = await PermissionGroupTemplate.findOne({
      key: String(templateKey || '').trim(),
      isActive: true,
    }).lean();
    if (!template) {
      await this.seedSystemTemplates();
      template = await PermissionGroupTemplate.findOne({
        key: String(templateKey || '').trim(),
        isActive: true,
      }).lean();
    }
    if (!template) {
      const def = getTemplateDefinition(templateKey);
      if (!def) throw serviceError('Template không tồn tại', 404, 'TEMPLATE_NOT_FOUND');
      template = { key: def.key, label: def.label, grants: def.grants };
    }

    const name = buildGroupName({
      specialization,
      templateLabel: template.label,
      allowOtherName: Boolean(allowOtherName),
      otherName,
    });

    const exists = await OrganizationPermissionGroup.findOne({
      organizationId: oid,
      name,
      isActive: true,
    }).lean();
    if (exists) throw serviceError('Permission Group đã tồn tại', 409, 'GROUP_NAME_EXISTS');

    const actor =
      actorUserId && mongoose.Types.ObjectId.isValid(String(actorUserId)) ? actorUserId : null;
    const doc = await OrganizationPermissionGroup.create({
      organizationId: oid,
      templateKey: template.key,
      specialization: normalizeSpecialization(specialization),
      name,
      grants: uniqueStrings(template.grants).filter(isValidMasterPermission),
      createdBy: actor,
      updatedBy: actor,
    });
    return doc.toObject();
  }

  async renameOrganizationGroup({
    organizationId,
    groupId,
    specialization = '',
    allowOtherName = false,
    otherName = '',
    actorUserId = null,
  }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const gid = asObjectId(groupId, 'groupId');
    const current = await OrganizationPermissionGroup.findOne({
      _id: gid,
      organizationId: oid,
      isActive: true,
    });
    if (!current) throw serviceError('Permission Group không tồn tại', 404, 'GROUP_NOT_FOUND');

    const template =
      (await PermissionGroupTemplate.findOne({ key: current.templateKey }).lean()) ||
      getTemplateDefinition(current.templateKey);
    const templateLabel = template?.label || current.templateKey;
    const nextName = buildGroupName({
      specialization,
      templateLabel,
      allowOtherName: Boolean(allowOtherName),
      otherName,
    });

    const clash = await OrganizationPermissionGroup.findOne({
      _id: { $ne: current._id },
      organizationId: oid,
      name: nextName,
      isActive: true,
    }).lean();
    if (clash) throw serviceError('Tên Permission Group đã tồn tại', 409, 'GROUP_NAME_EXISTS');

    current.name = nextName;
    current.specialization = normalizeSpecialization(specialization);
    current.updatedBy =
      actorUserId && mongoose.Types.ObjectId.isValid(String(actorUserId)) ? actorUserId : null;
    await current.save();
    return current.toObject();
  }

  async setOrganizationGroupGrants({ organizationId, groupId, grants = [], actorUserId = null }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const gid = asObjectId(groupId, 'groupId');
    const group = await OrganizationPermissionGroup.findOne({
      _id: gid,
      organizationId: oid,
      isActive: true,
    });
    if (!group) throw serviceError('Permission Group không tồn tại', 404, 'GROUP_NOT_FOUND');

    const normalized = uniqueStrings(grants);
    const invalid = normalized.filter((g) => !isValidMasterPermission(g));
    if (invalid.length) {
      throw serviceError(
        `Master Permission không hợp lệ: ${invalid.join(', ')}`,
        400,
        'MASTER_PERMISSION_INVALID'
      );
    }

    group.grants = normalized;
    group.updatedBy =
      actorUserId && mongoose.Types.ObjectId.isValid(String(actorUserId)) ? actorUserId : null;
    await group.save();

    const bindings = await RolePermissionGroupBinding.find({
      organizationId: oid,
      permissionGroupId: gid,
      isActive: true,
    })
      .select('roleId')
      .lean();
    for (const b of bindings) {
      await rematerializeRolePermissions(oid, b.roleId);
    }
    return group.toObject();
  }

  async listOrganizationGroups({ organizationId }) {
    const oid = asObjectId(organizationId, 'organizationId');
    return OrganizationPermissionGroup.find({ organizationId: oid, isActive: true })
      .sort({ createdAt: 1 })
      .lean();
  }

  async assignGroupToRole({
    organizationId,
    roleId,
    permissionGroupId,
    roleLayer = 'organization',
    actorUserId = null,
  }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const rid = asObjectId(roleId, 'roleId');
    const gid = asObjectId(permissionGroupId, 'permissionGroupId');
    const layer = roleLayer === 'project' ? 'project' : 'organization';

    const role = await Role.findOne({
      _id: rid,
      isActive: true,
      $or: [{ organizationId: oid }, { serverId: oid }],
    }).lean();
    if (!role) throw serviceError('Role không tồn tại trong organization', 404, 'ROLE_NOT_FOUND');

    const group = await OrganizationPermissionGroup.findOne({
      _id: gid,
      organizationId: oid,
      isActive: true,
    }).lean();
    if (!group) throw serviceError('Permission Group không tồn tại', 404, 'GROUP_NOT_FOUND');

    await RolePermissionGroupBinding.updateOne(
      { organizationId: oid, roleId: rid, permissionGroupId: gid, roleLayer: layer },
      {
        $set: {
          isActive: true,
          assignedBy:
            actorUserId && mongoose.Types.ObjectId.isValid(String(actorUserId))
              ? actorUserId
              : null,
        },
      },
      { upsert: true }
    );
    await rematerializeRolePermissions(oid, rid);
    return { ok: true };
  }

  async replaceRoleGroups({
    organizationId,
    roleId,
    permissionGroupIds = [],
    roleLayer = 'organization',
    actorUserId = null,
  }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const rid = asObjectId(roleId, 'roleId');
    const layer = roleLayer === 'project' ? 'project' : 'organization';
    const normalizedIds = uniqueStrings(permissionGroupIds).map((x) =>
      asObjectId(x, 'permissionGroupId')
    );

    await RolePermissionGroupBinding.updateMany(
      { organizationId: oid, roleId: rid, roleLayer: layer },
      { $set: { isActive: false } }
    );
    for (const gid of normalizedIds) {
      await this.assignGroupToRole({
        organizationId: oid,
        roleId: rid,
        permissionGroupId: gid,
        roleLayer: layer,
        actorUserId,
      });
    }
    await rematerializeRolePermissions(oid, rid);
    return { ok: true, count: normalizedIds.length };
  }

  async listRoleBindings({ organizationId, roleId }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const rid = asObjectId(roleId, 'roleId');
    return RolePermissionGroupBinding.find({
      organizationId: oid,
      roleId: rid,
      isActive: true,
    }).lean();
  }

  /**
   * Sync grants on default (empty specialization) org groups from system templates,
   * then rematerialize Role.permissions for bound roles.
   */
  async syncDefaultGroupGrantsFromTemplates(organizationId) {
    const oid = asObjectId(organizationId, 'organizationId');
    await this.seedSystemTemplates();
    const groups = await OrganizationPermissionGroup.find({
      organizationId: oid,
      isActive: true,
      $or: [{ specialization: '' }, { specialization: null }, { specialization: { $exists: false } }],
    });
    let updated = 0;
    for (const group of groups) {
      const def = getTemplateDefinition(group.templateKey);
      if (!def) continue;
      const nextGrants = uniqueStrings(def.grants).filter(isValidMasterPermission);
      const prev = uniqueStrings(group.grants).sort().join('|');
      const next = [...nextGrants].sort().join('|');
      if (prev === next) continue;
      group.grants = nextGrants;
      await group.save();
      updated += 1;
      const bindings = await RolePermissionGroupBinding.find({
        organizationId: oid,
        permissionGroupId: group._id,
        isActive: true,
      })
        .select('roleId')
        .lean();
      for (const b of bindings) {
        await rematerializeRolePermissions(oid, b.roleId);
      }
    }
    return { organizationId: oid, groupsUpdated: updated };
  }

  /**
   * Build map templateKey → roleId from active org groups + bindings.
   * Prefers groups with empty specialization (default seed clones).
   */
  async buildRoleIdByTemplateKey(organizationId) {
    const oid = asObjectId(organizationId, 'organizationId');
    const groups = await OrganizationPermissionGroup.find({
      organizationId: oid,
      isActive: true,
    })
      .select('_id templateKey specialization')
      .lean();

    const preferred = new Map();
    const fallback = new Map();
    for (const g of groups) {
      const key = String(g.templateKey || '').trim();
      if (!key) continue;
      const isDefaultSpec = !String(g.specialization || '').trim();
      if (isDefaultSpec && !preferred.has(key)) preferred.set(key, g._id);
      if (!fallback.has(key)) fallback.set(key, g._id);
    }

    const map = {};
    const templateKeys = new Set([...preferred.keys(), ...fallback.keys()]);
    for (const templateKey of templateKeys) {
      const groupId = preferred.get(templateKey) || fallback.get(templateKey);
      const binding = await RolePermissionGroupBinding.findOne({
        organizationId: oid,
        permissionGroupId: groupId,
        isActive: true,
      })
        .select('roleId')
        .lean();
      if (binding?.roleId) map[templateKey] = String(binding.roleId);
    }
    return map;
  }

  /**
   * Rebind UserRole for all active org memberships → V2 roles by Membership.role map.
   * Does not purge roles/groups; idempotent assign (upsert active UserRole).
   */
  async rebindOrganizationMembers({
    organizationId,
    roleByTemplate = null,
    actorUserId = null,
  }) {
    const oid = asObjectId(organizationId, 'organizationId');
    const resolvedMap =
      roleByTemplate && Object.keys(roleByTemplate).length
        ? roleByTemplate
        : await this.buildRoleIdByTemplateKey(oid);

    const viewerRoleId = resolvedMap.viewer || null;
    const members = await fetchOrganizationMemberships(oid);
    if (!members.length) {
      logger.warn('[rbacV2] rebindOrganizationMembers: no memberships returned', {
        organizationId: oid,
      });
      return { organizationId: oid, assigned: 0, skipped: 0, members: 0, details: [] };
    }

    const actor =
      actorUserId && mongoose.Types.ObjectId.isValid(String(actorUserId)) ? actorUserId : null;
    let assigned = 0;
    let skipped = 0;
    const details = [];

    for (const row of members) {
      const userId = String(row.userId || '').trim();
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        skipped += 1;
        details.push({ userId, ok: false, reason: 'invalid_user' });
        continue;
      }
      const templateKey = membershipRoleToTemplateKey(row.role);
      const roleId = resolvedMap[templateKey] || viewerRoleId;
      if (!roleId) {
        skipped += 1;
        details.push({ userId, ok: false, reason: 'role_missing', templateKey });
        continue;
      }

      try {
        await UserRole.updateOne(
          { userId, serverId: oid, roleId },
          {
            $set: {
              isActive: true,
              assignedBy: actor,
              assignedAt: new Date(),
            },
            $unset: { expiresAt: 1 },
          },
          { upsert: true }
        );
        const redis = getRedisClient();
        if (redis) {
          await redis.del(`permissions:${userId}:${oid}`);
        }
        assigned += 1;
        details.push({ userId, ok: true, templateKey, roleId: String(roleId) });
      } catch (err) {
        skipped += 1;
        details.push({ userId, ok: false, reason: err.message, templateKey });
        logger.warn('[rbacV2] rebind assign failed', { userId, organizationId: oid, err: err.message });
      }
    }

    logger.info('[rbacV2] rebindOrganizationMembers done', {
      organizationId: oid,
      members: members.length,
      assigned,
      skipped,
    });

    return {
      organizationId: oid,
      members: members.length,
      assigned,
      skipped,
      details,
    };
  }

  /**
   * Direct replace: purge legacy roles/userRoles for org, seed templates + default groups,
   * recreate default organization roles bound to groups, then rebind memberships.
   */
  async directReplaceOrganization({ organizationId, actorUserId = null }) {
    const oid = asObjectId(organizationId, 'organizationId');
    assertCatalogIntegrity();
    await this.seedSystemTemplates();

    const existingRoles = await Role.find({
      $or: [{ organizationId: oid }, { serverId: oid }],
    })
      .select('_id')
      .lean();
    const roleIds = existingRoles.map((r) => r._id);

    await UserRole.deleteMany({ serverId: oid });
    if (roleIds.length) {
      await RolePermissionGroupBinding.deleteMany({
        $or: [{ organizationId: oid }, { roleId: { $in: roleIds } }],
      });
      await Role.deleteMany({ _id: { $in: roleIds } });
    }
    await OrganizationPermissionGroup.deleteMany({ organizationId: oid });

    const defaultSpecs = [
      { templateKey: 'organization_admin', specialization: '', nameHint: 'Organization Admin', priority: 200 },
      { templateKey: 'project_admin', specialization: '', nameHint: 'Project Admin', priority: 180 },
      { templateKey: 'department_manager', specialization: '', nameHint: 'Department Manager', priority: 150 },
      { templateKey: 'project_manager', specialization: '', nameHint: 'Project Manager', priority: 140 },
      { templateKey: 'product_owner', specialization: '', nameHint: 'Product Owner', priority: 130 },
      { templateKey: 'scrum_master', specialization: '', nameHint: 'Scrum Master', priority: 120 },
      { templateKey: 'developer', specialization: '', nameHint: 'Developer', priority: 80 },
      { templateKey: 'qa', specialization: '', nameHint: 'QA', priority: 70 },
      { templateKey: 'viewer', specialization: '', nameHint: 'Viewer', priority: 20 },
    ];

    const createdGroups = [];
    const createdRoles = [];
    const roleByTemplate = {};
    for (const spec of defaultSpecs) {
      const group = await this.cloneTemplate({
        organizationId: oid,
        templateKey: spec.templateKey,
        specialization: spec.specialization,
        actorUserId,
      });
      createdGroups.push(group);

      const permissions = materializeLegacyPermissions(group.grants);
      if (!permissions.some((p) => p.resource === 'role' && (p.actions || []).includes('read'))) {
        permissions.push({ resource: 'role', actions: ['read'] });
      }
      const role = await Role.create({
        name: group.name,
        description: `RBAC V2 · template ${spec.templateKey}`,
        scope: 'ORGANIZATION',
        serverId: oid,
        organizationId: oid,
        permissions,
        color: '#6366f1',
        isDefault: spec.templateKey === 'viewer' || spec.templateKey === 'organization_admin',
        priority: spec.priority,
        isActive: true,
      });
      createdRoles.push(role.toObject());
      roleByTemplate[spec.templateKey] = String(role._id);
      await this.assignGroupToRole({
        organizationId: oid,
        roleId: role._id,
        permissionGroupId: group._id,
        roleLayer: 'organization',
        actorUserId,
      });
    }

    const rebind = await this.rebindOrganizationMembers({
      organizationId: oid,
      roleByTemplate,
      actorUserId,
    });

    logger.info('[rbacV2] directReplaceOrganization done', {
      organizationId: oid,
      groups: createdGroups.length,
      roles: createdRoles.length,
      rebindAssigned: rebind.assigned,
    });

    return {
      organizationId: oid,
      groups: createdGroups,
      roles: createdRoles,
      rebind,
    };
  }

  async collectEffectiveMasterGrants(userId, organizationId) {
    const uid = asObjectId(userId, 'userId');
    const oid = asObjectId(organizationId, 'organizationId');
    const userRoles = await UserRole.find({
      userId: uid,
      serverId: oid,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .select('roleId')
      .lean();
    const roleIds = userRoles.map((ur) => ur.roleId).filter(Boolean);
    if (!roleIds.length) return [];

    const bindings = await RolePermissionGroupBinding.find({
      organizationId: oid,
      roleId: { $in: roleIds },
      isActive: true,
    })
      .select('permissionGroupId')
      .lean();
    const groupIds = bindings.map((b) => b.permissionGroupId);
    if (!groupIds.length) return [];

    const groups = await OrganizationPermissionGroup.find({
      _id: { $in: groupIds },
      organizationId: oid,
      isActive: true,
    })
      .select('grants')
      .lean();

    const grants = [];
    for (const g of groups) grants.push(...(g.grants || []));
    return uniqueStrings(grants).filter(isValidMasterPermission);
  }
}

module.exports = new RbacV2Service();
module.exports.rematerializeRolePermissions = rematerializeRolePermissions;
module.exports.buildGroupName = buildGroupName;
