const { mongoose } = require('@enterprise/shared/config/mongo');
const OrganizationalRole = require('../models/OrganizationalRole');
const OrgRolePermission = require('../models/OrgRolePermission');
const { SCOPE_TYPES } = require('../models/OrgRolePermission');
const OrganizationalPosition = require('../models/OrganizationalPosition');
const PositionRoleBinding = require('../models/PositionRoleBinding');
const EmployeePositionAssignment = require('../models/EmployeePositionAssignment');

const SCOPE_RANK = Object.freeze({
  SELF: 1,
  DEPARTMENT: 2,
  ORGANIZATION: 3,
  SYSTEM: 4,
});

function serviceError(message, statusCode = 400, errorCode = 'ORG_RBAC_FAILED') {
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
  return new mongoose.Types.ObjectId(id);
}

function slugCode(raw, fallbackPrefix = 'item') {
  const base = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return base || `${fallbackPrefix}_${Date.now().toString(36)}`;
}

function mergeScope(a, b) {
  const ra = SCOPE_RANK[a] || 0;
  const rb = SCOPE_RANK[b] || 0;
  return ra >= rb ? a : b;
}

function assertScope(scopeType) {
  const s = String(scopeType || '').trim().toUpperCase();
  if (!SCOPE_TYPES.includes(s)) {
    throw serviceError(
      `scopeType phải là một trong: ${SCOPE_TYPES.join(', ')}`,
      400,
      'VALIDATION_SCOPE'
    );
  }
  return s;
}

/* ---------- Org Roles ---------- */

async function listRoles(organizationId, { includeDisabled = false } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const filter = { organizationId: oid };
  if (!includeDisabled) filter.status = 'active';
  return OrganizationalRole.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

async function createRole(organizationId, { code, name, description, sortOrder } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const roleName = String(name || '').trim();
  if (!roleName) throw serviceError('name là bắt buộc', 400, 'VALIDATION_NAME');
  const roleCode = slugCode(code || roleName, 'role');
  const last = await OrganizationalRole.find({ organizationId: oid })
    .sort({ sortOrder: -1 })
    .select('sortOrder')
    .limit(1)
    .lean();
  const nextSort =
    Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : (Number(last?.[0]?.sortOrder) || 0) + 10;

  try {
    const row = await OrganizationalRole.create({
      organizationId: oid,
      code: roleCode,
      name: roleName,
      description: String(description || '').trim(),
      sortOrder: nextSort,
      status: 'active',
    });
    return row.toObject();
  } catch (error) {
    if (Number(error?.code) === 11000) {
      throw serviceError('Mã vai trò đã tồn tại trong tổ chức', 409, 'ROLE_CODE_CONFLICT');
    }
    throw error;
  }
}

async function updateRole(organizationId, roleId, patch = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const rid = asObjectId(roleId, 'roleId');
  const $set = {};
  if (patch.name != null) $set.name = String(patch.name).trim();
  if (patch.description != null) $set.description = String(patch.description).trim();
  if (patch.status != null) {
    const st = String(patch.status).trim();
    if (!['active', 'disabled'].includes(st)) {
      throw serviceError('status không hợp lệ', 400, 'VALIDATION_STATUS');
    }
    $set.status = st;
  }
  if (patch.sortOrder != null) $set.sortOrder = Number(patch.sortOrder) || 0;
  if (patch.code != null) $set.code = slugCode(patch.code, 'role');
  if (!Object.keys($set).length) {
    const existing = await OrganizationalRole.findOne({ _id: rid, organizationId: oid }).lean();
    if (!existing) throw serviceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
    return existing;
  }
  try {
    const row = await OrganizationalRole.findOneAndUpdate(
      { _id: rid, organizationId: oid },
      { $set },
      { new: true }
    ).lean();
    if (!row) throw serviceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
    return row;
  } catch (error) {
    if (Number(error?.code) === 11000) {
      throw serviceError('Mã vai trò đã tồn tại trong tổ chức', 409, 'ROLE_CODE_CONFLICT');
    }
    throw error;
  }
}

async function reorderRoles(organizationId, orderedIds = []) {
  const oid = asObjectId(organizationId, 'organizationId');
  const ids = (Array.isArray(orderedIds) ? orderedIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const ops = ids.map((id, index) => ({
    updateOne: {
      filter: { _id: asObjectId(id, 'roleId'), organizationId: oid },
      update: { $set: { sortOrder: (index + 1) * 10 } },
    },
  }));
  if (ops.length) await OrganizationalRole.bulkWrite(ops);
  return listRoles(organizationId, { includeDisabled: true });
}

async function deleteRole(organizationId, roleId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const rid = asObjectId(roleId, 'roleId');
  const bindCount = await PositionRoleBinding.countDocuments({ organizationId: oid, roleId: rid });
  if (bindCount > 0) {
    throw serviceError(
      'Vai trò đang gắn với vị trí — gỡ binding trước khi xóa',
      409,
      'ROLE_IN_USE'
    );
  }
  await OrgRolePermission.deleteMany({ organizationId: oid, roleId: rid });
  const deleted = await OrganizationalRole.findOneAndDelete({ _id: rid, organizationId: oid }).lean();
  if (!deleted) throw serviceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
  return deleted;
}

async function getRolePermissionMatrix(organizationId, roleId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const rid = asObjectId(roleId, 'roleId');
  const role = await OrganizationalRole.findOne({ _id: rid, organizationId: oid }).lean();
  if (!role) throw serviceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
  const permissions = await OrgRolePermission.find({ organizationId: oid, roleId: rid })
    .select('permissionCode scopeType')
    .lean();
  return {
    role,
    permissions: permissions.map((p) => ({
      permissionCode: p.permissionCode,
      scopeType: p.scopeType,
    })),
  };
}

async function replaceRolePermissionMatrix(organizationId, roleId, entries = []) {
  const oid = asObjectId(organizationId, 'organizationId');
  const rid = asObjectId(roleId, 'roleId');
  const role = await OrganizationalRole.findOne({ _id: rid, organizationId: oid }).lean();
  if (!role) throw serviceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');

  const list = Array.isArray(entries) ? entries : [];
  const normalized = [];
  const seen = new Set();
  for (const raw of list) {
    const permissionCode = String(raw?.permissionCode || raw?.code || '').trim().toLowerCase();
    if (!permissionCode || !permissionCode.includes('.')) {
      throw serviceError(`permissionCode không hợp lệ: ${permissionCode}`, 400, 'VALIDATION_PERMISSION');
    }
    if (seen.has(permissionCode)) continue;
    seen.add(permissionCode);
    normalized.push({
      organizationId: oid,
      roleId: rid,
      permissionCode,
      scopeType: assertScope(raw?.scopeType || 'ORGANIZATION'),
    });
  }

  await OrgRolePermission.deleteMany({ organizationId: oid, roleId: rid });
  if (normalized.length) await OrgRolePermission.insertMany(normalized);
  return getRolePermissionMatrix(organizationId, roleId);
}

/* ---------- Positions ---------- */

async function listPositions(organizationId, { includeDisabled = false } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const filter = { organizationId: oid };
  if (!includeDisabled) filter.status = 'active';
  return OrganizationalPosition.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

async function createPosition(organizationId, { code, name, description, sortOrder } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const posName = String(name || '').trim();
  if (!posName) throw serviceError('name là bắt buộc', 400, 'VALIDATION_NAME');
  const posCode = slugCode(code || posName, 'pos');
  const last = await OrganizationalPosition.find({ organizationId: oid })
    .sort({ sortOrder: -1 })
    .select('sortOrder')
    .limit(1)
    .lean();
  const nextSort =
    Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : (Number(last?.[0]?.sortOrder) || 0) + 10;

  try {
    const row = await OrganizationalPosition.create({
      organizationId: oid,
      code: posCode,
      name: posName,
      description: String(description || '').trim(),
      sortOrder: nextSort,
      status: 'active',
    });
    return row.toObject();
  } catch (error) {
    if (Number(error?.code) === 11000) {
      throw serviceError('Mã vị trí đã tồn tại trong tổ chức', 409, 'POSITION_CODE_CONFLICT');
    }
    throw error;
  }
}

async function updatePosition(organizationId, positionId, patch = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const pid = asObjectId(positionId, 'positionId');
  const $set = {};
  if (patch.name != null) $set.name = String(patch.name).trim();
  if (patch.description != null) $set.description = String(patch.description).trim();
  if (patch.status != null) {
    const st = String(patch.status).trim();
    if (!['active', 'disabled'].includes(st)) {
      throw serviceError('status không hợp lệ', 400, 'VALIDATION_STATUS');
    }
    $set.status = st;
  }
  if (patch.sortOrder != null) $set.sortOrder = Number(patch.sortOrder) || 0;
  if (patch.code != null) $set.code = slugCode(patch.code, 'pos');
  const row = await OrganizationalPosition.findOneAndUpdate(
    { _id: pid, organizationId: oid },
    { $set },
    { new: true }
  ).lean();
  if (!row) throw serviceError('Không tìm thấy vị trí', 404, 'POSITION_NOT_FOUND');
  return row;
}

async function deletePosition(organizationId, positionId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const pid = asObjectId(positionId, 'positionId');
  const activeAssign = await EmployeePositionAssignment.countDocuments({
    organizationId: oid,
    positionId: pid,
    status: 'active',
  });
  if (activeAssign > 0) {
    throw serviceError(
      'Vị trí đang được gán cho nhân sự — kết thúc assignment trước khi xóa',
      409,
      'POSITION_IN_USE'
    );
  }
  await PositionRoleBinding.deleteMany({ organizationId: oid, positionId: pid });
  const deleted = await OrganizationalPosition.findOneAndDelete({
    _id: pid,
    organizationId: oid,
  }).lean();
  if (!deleted) throw serviceError('Không tìm thấy vị trí', 404, 'POSITION_NOT_FOUND');
  return deleted;
}

async function getPositionRoleBindings(organizationId, positionId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const pid = asObjectId(positionId, 'positionId');
  const position = await OrganizationalPosition.findOne({ _id: pid, organizationId: oid }).lean();
  if (!position) throw serviceError('Không tìm thấy vị trí', 404, 'POSITION_NOT_FOUND');
  const bindings = await PositionRoleBinding.find({ organizationId: oid, positionId: pid }).lean();
  const roleIds = bindings.map((b) => b.roleId);
  const roles = roleIds.length
    ? await OrganizationalRole.find({ _id: { $in: roleIds }, organizationId: oid }).lean()
    : [];
  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  return {
    position,
    bindings: bindings.map((b) => ({
      roleId: String(b.roleId),
      isDefault: Boolean(b.isDefault),
      role: roleById.get(String(b.roleId)) || null,
    })),
  };
}

async function replacePositionRoleBindings(organizationId, positionId, roleIds = []) {
  const oid = asObjectId(organizationId, 'organizationId');
  const pid = asObjectId(positionId, 'positionId');
  const position = await OrganizationalPosition.findOne({ _id: pid, organizationId: oid }).lean();
  if (!position) throw serviceError('Không tìm thấy vị trí', 404, 'POSITION_NOT_FOUND');

  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id) => String(id).trim()).filter(Boolean))];
  const objectIds = ids.map((id) => asObjectId(id, 'roleId'));
  if (objectIds.length) {
    const found = await OrganizationalRole.countDocuments({
      organizationId: oid,
      _id: { $in: objectIds },
      status: 'active',
    });
    if (found !== objectIds.length) {
      throw serviceError('Một hoặc nhiều roleId không thuộc tổ chức / không active', 400, 'ROLE_INVALID');
    }
  }

  await PositionRoleBinding.deleteMany({ organizationId: oid, positionId: pid });
  if (objectIds.length) {
    await PositionRoleBinding.insertMany(
      objectIds.map((roleId) => ({
        organizationId: oid,
        positionId: pid,
        roleId,
        isDefault: true,
      }))
    );
  }
  return getPositionRoleBindings(organizationId, positionId);
}

/* ---------- Assignments ---------- */

async function listAssignments(organizationId, { userId = null, status = 'active' } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const filter = { organizationId: oid };
  if (status) filter.status = status;
  if (userId) filter.userId = asObjectId(userId, 'userId');
  return EmployeePositionAssignment.find(filter).sort({ updatedAt: -1 }).lean();
}

async function assignPositionToUser(organizationId, { userId, positionId, departmentId = null } = {}) {
  const oid = asObjectId(organizationId, 'organizationId');
  const uid = asObjectId(userId, 'userId');
  const pid = asObjectId(positionId, 'positionId');
  const position = await OrganizationalPosition.findOne({
    _id: pid,
    organizationId: oid,
    status: 'active',
  }).lean();
  if (!position) throw serviceError('Không tìm thấy vị trí active', 404, 'POSITION_NOT_FOUND');

  await EmployeePositionAssignment.updateMany(
    { organizationId: oid, userId: uid, status: 'active' },
    { $set: { status: 'ended', endAt: new Date() } }
  );

  const row = await EmployeePositionAssignment.create({
    organizationId: oid,
    userId: uid,
    positionId: pid,
    departmentId: departmentId ? asObjectId(departmentId, 'departmentId') : null,
    status: 'active',
    startAt: new Date(),
  });
  return row.toObject();
}

async function endAssignment(organizationId, assignmentId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const aid = asObjectId(assignmentId, 'assignmentId');
  const row = await EmployeePositionAssignment.findOneAndUpdate(
    { _id: aid, organizationId: oid, status: 'active' },
    { $set: { status: 'ended', endAt: new Date() } },
    { new: true }
  ).lean();
  if (!row) throw serviceError('Không tìm thấy assignment active', 404, 'ASSIGNMENT_NOT_FOUND');
  return row;
}

/**
 * Resolve effective permission codes + scopes for a user in an org.
 * Path: EmployeePositionAssignment → PositionRoleBinding → OrgRolePermission
 */
async function resolveEffectiveGrants(organizationId, userId) {
  const oid = asObjectId(organizationId, 'organizationId');
  const uid = asObjectId(userId, 'userId');

  const assignments = await EmployeePositionAssignment.find({
    organizationId: oid,
    userId: uid,
    status: 'active',
  })
    .select('positionId departmentId')
    .lean();

  if (!assignments.length) {
    return { grantScopes: {}, positionIds: [], roleIds: [] };
  }

  const positionIds = [...new Set(assignments.map((a) => String(a.positionId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const bindings = await PositionRoleBinding.find({
    organizationId: oid,
    positionId: { $in: positionIds },
  })
    .select('roleId')
    .lean();

  const roleIds = [...new Set(bindings.map((b) => String(b.roleId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  if (!roleIds.length) {
    return {
      grantScopes: {},
      positionIds: positionIds.map(String),
      roleIds: [],
    };
  }

  const activeRoles = await OrganizationalRole.find({
    organizationId: oid,
    _id: { $in: roleIds },
    status: 'active',
  })
    .select('_id')
    .lean();
  const activeRoleIds = activeRoles.map((r) => r._id);

  const perms = await OrgRolePermission.find({
    organizationId: oid,
    roleId: { $in: activeRoleIds },
  })
    .select('permissionCode scopeType')
    .lean();

  const scopeMap = {};
  for (const p of perms) {
    const code = String(p.permissionCode || '').trim().toLowerCase();
    if (!code) continue;
    scopeMap[code] = scopeMap[code] ? mergeScope(scopeMap[code], p.scopeType) : p.scopeType;
  }

  return {
    grantScopes: scopeMap,
    positionIds: positionIds.map(String),
    roleIds: activeRoleIds.map(String),
  };
}

module.exports = {
  SCOPE_TYPES,
  SCOPE_RANK,
  listRoles,
  createRole,
  updateRole,
  reorderRoles,
  deleteRole,
  getRolePermissionMatrix,
  replaceRolePermissionMatrix,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getPositionRoleBindings,
  replacePositionRoleBindings,
  listAssignments,
  assignPositionToUser,
  endAssignment,
  resolveEffectiveGrants,
};
