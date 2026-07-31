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
const {
  allocateUniqueRoleKey,
  ensureRoleKeyNamespace,
} = require('@enterprise/shared/utils/roleKeySlug');
const {
  ORG_ROLE_LABEL_PREFIX,
  normalizeLayerLabel,
  splitLayerLabel,
} = require('@enterprise/shared/utils/roleLayerNaming');
const {
  sortOrderFromIndex,
  nextAppendSortOrder,
  validateOrderedIdsPermutation,
  insertIdAtPlace,
} = require('@enterprise/shared/utils/catalogSortOrder');

const DEFAULT_ORG_ROLE_LABELS = {
  [ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER]: `${ORG_ROLE_LABEL_PREFIX}Department Manager`,
  [ORGANIZATION_ROLE_KEYS.TEAM_MANAGER]: `${ORG_ROLE_LABEL_PREFIX}Team Manager`,
  [ORGANIZATION_ROLE_KEYS.DIRECTOR]: `${ORG_ROLE_LABEL_PREFIX}Director`,
};

const DEFAULT_ORG_ROLE_ROWS = [
  { key: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER, sortOrder: 10 },
  { key: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER, sortOrder: 20 },
  { key: ORGANIZATION_ROLE_KEYS.DIRECTOR, sortOrder: 30 },
];

async function ensureDefaultCatalog(organizationId) {
  const oid = toObjectId(organizationId);
  // Upsert để đảm bảo luôn có 3 key system role + label theo convention.
  for (const def of DEFAULT_ORG_ROLE_ROWS) {
    await OrgRoleCatalog.findOneAndUpdate(
      { organizationId: oid, key: def.key },
      {
        $set: {
          label: DEFAULT_ORG_ROLE_LABELS[def.key] || def.key,
          isSystem: true,
        },
        $setOnInsert: {
          organizationId: oid,
          key: def.key,
          description: '',
          sortOrder: def.sortOrder,
        },
      },
      { upsert: true, new: true }
    );
  }

  // Custom org roles: đảm bảo nhãn có prefix «Cơ cấu —».
  const customs = await OrgRoleCatalog.find({
    organizationId: oid,
    isSystem: { $ne: true },
  })
    .select('_id label')
    .lean();
  for (const row of customs) {
    const next = normalizeLayerLabel(row.label, 'org');
    if (!next || next === row.label) continue;
    await OrgRoleCatalog.updateOne({ _id: row._id }, { $set: { label: next } });
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
    const { key, label, description = '', place, afterRoleId } = req.body || {};
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');

    const l = String(label || '').trim();
    if (!l) return orgValidation(res, 'label là bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const existingRows = await OrgRoleCatalog.find({ organizationId: oid })
      .select('_id key sortOrder')
      .sort({ sortOrder: 1 })
      .lean();
    const existingKeys = existingRows.map((r) => r.key);
    const normalizedLabel = normalizeLayerLabel(l, 'org');
    const { suffix } = splitLayerLabel(normalizedLabel, 'org');
    const rawKey = String(key || '').trim();
    const base = ensureRoleKeyNamespace(rawKey || suffix || normalizedLabel, 'org');
    const k = allocateUniqueRoleKey(base, existingKeys);

    const row = await OrgRoleCatalog.create({
      organizationId: oid,
      key: k,
      label: normalizedLabel,
      description: String(description || ''),
      isSystem: false,
      sortOrder: nextAppendSortOrder(existingRows),
    });

    const orderedIds = insertIdAtPlace(
      existingRows.map((r) => String(r._id)),
      String(row._id),
      { place: place || 'end', afterRoleId }
    );
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: toObjectId(id), organizationId: oid },
        update: { $set: { sortOrder: sortOrderFromIndex(index) } },
      },
    }));
    if (ops.length) await OrgRoleCatalog.bulkWrite(ops);

    const refreshed = await OrgRoleCatalog.findById(row._id).lean();
    return res.status(201).json({ success: true, data: { role: refreshed } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function updateCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const roleId = String(req.params.roleId || '').trim();
    const { label, description } = req.body || {};
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
      patch.label = normalizeLayerLabel(l, 'org');
    }
    if (description !== undefined) patch.description = String(description || '');

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

async function reorderCatalog(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
    if (!organizationId) return orgValidation(res, 'organizationId bắt buộc');
    if (!orderedIds) return orgValidation(res, 'orderedIds bắt buộc');

    const oid = toObjectId(organizationId);
    await ensureDefaultCatalog(organizationId);

    const roles = await OrgRoleCatalog.find({ organizationId: oid }).select('_id').lean();
    const existingIds = roles.map((r) => String(r._id));
    const check = validateOrderedIdsPermutation(existingIds, orderedIds);
    if (!check.ok) return orgValidation(res, check.reason || 'orderedIds không hợp lệ');

    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: toObjectId(id), organizationId: oid },
        update: { $set: { sortOrder: sortOrderFromIndex(index) } },
      },
    }));
    if (ops.length) await OrgRoleCatalog.bulkWrite(ops);

    const next = await OrgRoleCatalog.find({ organizationId: oid }).sort({ sortOrder: 1 }).lean();
    return res.json({ success: true, data: { roles: next } });
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
  reorderCatalog,
  deleteCatalog,
  listAssignments,
  setAssignments,
};

