const OrgRoleCatalog = require('../models/OrgRoleCatalog');
const OrgRoleAssignment = require('../models/OrgRoleAssignment');
const {
  orgValidation,
  orgConflict,
  orgNotFound,
  orgCatch,
} = require('../utils/orgApiError');
const { sendServiceError } = require('../middleware/sendServiceError');
const { toObjectId } = require('../utils/orgAccess');
const { ORGANIZATION_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

const DEFAULT_ORG_ROLE_LABELS = {
  [ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER]: 'Department Manager',
  [ORGANIZATION_ROLE_KEYS.TEAM_MANAGER]: 'Team Manager',
  [ORGANIZATION_ROLE_KEYS.DIRECTOR]: 'Director',
};

const DEFAULT_ORG_ROLE_ROWS = [
  { key: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER, sortOrder: 10 },
  { key: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER, sortOrder: 20 },
  { key: ORGANIZATION_ROLE_KEYS.DIRECTOR, sortOrder: 30 },
];

async function ensureDefaultCatalog(organizationId) {
  const oid = toObjectId(organizationId);
  // Upsert để đảm bảo luôn có 3 key system role.
  for (const def of DEFAULT_ORG_ROLE_ROWS) {
    await OrgRoleCatalog.findOneAndUpdate(
      { organizationId: oid, key: def.key },
      {
        $set: {
          label: DEFAULT_ORG_ROLE_LABELS[def.key] || def.key,
          isSystem: true,
          sortOrder: def.sortOrder,
        },
        $setOnInsert: {
          organizationId: oid,
          key: def.key,
          description: '',
        },
      },
      { upsert: true, new: true }
    );
  }
}

function normalizeRoleKeys(roleKeys) {
  if (!Array.isArray(roleKeys)) return [];
  return roleKeys.map((k) => String(k || '').trim()).filter(Boolean);
}

async function listCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');

    await ensureDefaultCatalog(organizationId);
    const oid = toObjectId(organizationId);

    const roles = await OrgRoleCatalog.find({ organizationId: oid })
      .sort({ sortOrder: 1 })
      .lean();

    return res.json({ success: true, data: { roles } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function createCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const { key, label, description = '', sortOrder } = req.body || {};
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');

    const k = String(key || '').trim();
    const l = String(label || '').trim();
    if (!k) return orgValidation(res, 'key là bắt buộc');
    if (!l) return orgValidation(res, 'label là bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const existing = await OrgRoleCatalog.findOne({ organizationId: oid, key: k }).lean();
    if (existing) return orgConflict(res, 'Key đã tồn tại', 'ORG_ROLE_KEY_EXISTS');
    const row = await OrgRoleCatalog.create({
      organizationId: oid,
      key: k,
      label: l,
      description: String(description || ''),
      isSystem: false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 100,
    });

    return res.status(201).json({ success: true, data: { role: row.toObject() } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function updateCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    const { label, description, sortOrder } = req.body || {};
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    if (!roleId) return orgValidation(res, 'roleId bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const role = await OrgRoleCatalog.findOne({ _id: toObjectId(roleId), organizationId: oid }).lean();
    if (!role) return orgNotFound(res, 'Org role không tồn tại');
    if (role.isSystem) return orgConflict(res, 'Không thể sửa role system mặc định', 'ORG_ROLE_SYSTEM');

    const patch = {};
    if (label !== undefined) {
      const l = String(label || '').trim();
      if (!l) return orgValidation(res, 'label không hợp lệ');
      patch.label = l;
    }
    if (description !== undefined) patch.description = String(description || '');
    if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);

    const updated = await OrgRoleCatalog.findOneAndUpdate(
      { _id: role._id },
      { $set: patch },
      { new: true }
    ).lean();

    return res.json({ success: true, data: { role: updated } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function deleteCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    if (!roleId) return orgValidation(res, 'roleId bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const role = await OrgRoleCatalog.findOne({ _id: toObjectId(roleId), organizationId: oid });
    if (!role) return orgNotFound(res, 'Org role không tồn tại');
    if (role.isSystem) return orgConflict(res, 'Không thể xóa role system mặc định', 'ORG_ROLE_SYSTEM');

    const assignmentCount = await OrgRoleAssignment.countDocuments({ organizationId: oid, roleKey: role.key });
    if (assignmentCount > 0) {
      return orgConflict(res, 'Không thể xóa: role đang được gán cho user', 'ORG_ROLE_IN_USE');
    }

    await role.deleteOne();
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function listAssignments(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    const oid = toObjectId(organizationId);

    const userId = req.query?.userId ? String(req.query.userId).trim() : '';
    const filter = { organizationId: oid };
    if (userId) filter.userId = toObjectId(userId);

    const [assignments, rolesByKey] = await Promise.all([
      OrgRoleAssignment.find(filter).lean(),
      OrgRoleCatalog.find({ organizationId: oid }).select('key label').lean(),
    ]);
    const roleMap = new Map((rolesByKey || []).map((r) => [r.key, r.label]));

    const items = (assignments || []).map((a) => ({
      userId: String(a.userId),
      roleKey: a.roleKey,
      roleLabel: roleMap.get(a.roleKey) || a.roleKey,
      scopeType: 'org',
      scopeName: 'Company',
      assignedAt: a.createdAt,
    }));

    return res.json({ success: true, data: { assignments: items } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function setAssignments(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const actorUserId = req.user?.id || req.user?.userId || req.user?._id;
    const { userId, roleKeys } = req.body || {};
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    if (!actorUserId) return sendServiceError(res, 401, { errorCode: 'AUTH_NO_TOKEN', messageUser: 'Unauthorized', message: 'Unauthorized' });
    if (!userId) return orgValidation(res, 'userId bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const uid = toObjectId(userId);
    const keys = normalizeRoleKeys(roleKeys);

    const roles = await OrgRoleCatalog.find({ organizationId: oid, key: { $in: keys } }).lean();
    const roleByKey = new Map((roles || []).map((r) => [r.key, r]));

    for (const k of keys) {
      const r = roleByKey.get(k);
      if (!r) return orgNotFound(res, `Org role không tồn tại: ${k}`);
      if (r.isSystem) {
        return orgConflict(res, 'Không thể gán role system mặc định', 'ORG_ROLE_SYSTEM_ASSIGN');
      }
    }

    // Reset assignment cho user.
    await OrgRoleAssignment.deleteMany({ organizationId: oid, userId: uid });

    if (!keys.length) {
      return res.json({ success: true, data: { assigned: [] } });
    }

    const now = Date.now();
    const docs = keys.map((k) => ({
      organizationId: oid,
      userId: uid,
      roleKey: k,
      assignedBy: toObjectId(actorUserId),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }));
    await OrgRoleAssignment.insertMany(docs);

    return res.json({ success: true, data: { assigned: keys } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

module.exports = {
  listCatalog,
  createCatalog,
  updateCatalog,
  deleteCatalog,
  listAssignments,
  setAssignments,
};

