/**
 * Nhãn «Vai trò tổ chức» hiển thị (footer / bootstrap / shell / danh sách người).
 * SoT quyền: vị trí → PositionRoleBinding → OrganizationalRole (+ UserOrgRoleGrant).
 * Gán catalog trực tiếp: OrgRoleAssignment — gộp cả hai để UI không hiện «Chưa gán» khi đã có quyền qua vị trí.
 */

const mongoose = require('mongoose');
const OrgRoleAssignment = require('../models/OrgRoleAssignment');
const OrgRoleCatalog = require('../models/OrgRoleCatalog');
const OrganizationalRole = require('../models/OrganizationalRole');
const EmployeePositionAssignment = require('../models/EmployeePositionAssignment');
const PositionRoleBinding = require('../models/PositionRoleBinding');
const UserOrgRoleGrant = require('../models/UserOrgRoleGrant');
const {
  resolveCanonicalOrganizationRoleKey,
} = require('@enterprise/shared/config/masterData');

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function canonRoleKey(raw) {
  const key = String(raw || '').trim();
  if (!key) return '';
  return resolveCanonicalOrganizationRoleKey(key) || key.toUpperCase();
}

function pushRole(byKey, roleKey, roleLabel) {
  const canon = canonRoleKey(roleKey);
  if (!canon || byKey.has(canon)) return;
  const label = String(roleLabel || roleKey || '').trim() || canon;
  byKey.set(canon, { roleKey: canon, roleLabel: label });
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {Array<string|import('mongoose').Types.ObjectId>} organizationIds
 * @returns {Promise<Map<string, Array<{ roleKey: string, roleLabel: string }>>>}
 */
async function mapOrganizationRolesByOrgId(userId, organizationIds = []) {
  const result = new Map();
  const uid = toObjectId(userId);
  const orgOids = (organizationIds || []).map((id) => toObjectId(id)).filter(Boolean);
  if (!uid || !orgOids.length) return result;

  for (const oid of orgOids) {
    result.set(String(oid), new Map());
  }

  const [directRows, positionRows, personalGrants, catalogRows] = await Promise.all([
    OrgRoleAssignment.find({ userId: uid, organizationId: { $in: orgOids } })
      .select('organizationId roleKey')
      .lean(),
    EmployeePositionAssignment.find({
      userId: uid,
      organizationId: { $in: orgOids },
      status: 'active',
    })
      .select('organizationId positionId')
      .lean(),
    UserOrgRoleGrant.find({ userId: uid, organizationId: { $in: orgOids } })
      .select('organizationId roleId')
      .lean(),
    OrgRoleCatalog.find({ organizationId: { $in: orgOids } })
      .select('organizationId key label')
      .lean(),
  ]);

  const catalogLabelByOrgKey = new Map();
  for (const row of catalogRows || []) {
    const oid = String(row.organizationId || '');
    const key = canonRoleKey(row.key);
    if (!oid || !key) continue;
    catalogLabelByOrgKey.set(`${oid}:${key}`, String(row.label || row.key || '').trim() || key);
  }

  for (const row of directRows || []) {
    const oid = String(row.organizationId || '');
    const key = canonRoleKey(row.roleKey);
    if (!oid || !key || !result.has(oid)) continue;
    const label = catalogLabelByOrgKey.get(`${oid}:${key}`) || row.roleKey;
    pushRole(result.get(oid), key, label);
  }

  const positionIds = [
    ...new Set((positionRows || []).map((r) => String(r.positionId || '')).filter(Boolean)),
  ];
  const personalRoleIds = [
    ...new Set((personalGrants || []).map((r) => String(r.roleId || '')).filter(Boolean)),
  ];

  const bindings = positionIds.length
    ? await PositionRoleBinding.find({
        organizationId: { $in: orgOids },
        positionId: { $in: positionIds },
      })
        .select('organizationId positionId roleId')
        .lean()
    : [];

  const roleIds = [
    ...new Set([
      ...bindings.map((b) => String(b.roleId || '')),
      ...personalRoleIds,
    ].filter(Boolean)),
  ];

  const roles = roleIds.length
    ? await OrganizationalRole.find({ _id: { $in: roleIds } })
        .select('_id organizationId code name')
        .lean()
    : [];
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  const positionOrgById = new Map();
  for (const row of positionRows || []) {
    const pid = String(row.positionId || '');
    const oid = String(row.organizationId || '');
    if (pid && oid) positionOrgById.set(pid, oid);
  }

  for (const binding of bindings || []) {
    const oid =
      String(binding.organizationId || '') ||
      positionOrgById.get(String(binding.positionId || '')) ||
      '';
    if (!oid || !result.has(oid)) continue;
    const role = roleById.get(String(binding.roleId || ''));
    if (!role) continue;
    pushRole(result.get(oid), role.code, role.name);
  }

  for (const grant of personalGrants || []) {
    const oid = String(grant.organizationId || '');
    if (!oid || !result.has(oid)) continue;
    const role = roleById.get(String(grant.roleId || ''));
    if (!role) continue;
    pushRole(result.get(oid), role.code, role.name);
  }

  const out = new Map();
  for (const [oid, byKey] of result.entries()) {
    out.set(oid, [...byKey.values()]);
  }
  return out;
}

/**
 * @param {string} organizationId
 * @param {string} userId
 * @returns {Promise<Array<{ roleKey: string, roleLabel: string }>>}
 */
async function listOrganizationRolesForUser(organizationId, userId) {
  const map = await mapOrganizationRolesByOrgId(userId, [organizationId]);
  return map.get(String(organizationId || '').trim()) || [];
}

/**
 * Map userId → rows cho danh sách thành viên (gán catalog + vai từ vị trí).
 * @param {string} organizationId
 * @param {Array<{ userId?: string, roleKey?: string, roleLabel?: string }>} directAssignments
 * @param {Array<{ userId?: string, orgRoleLabels?: string[], orgRoleKeys?: string[] }>} positionAssignments
 * @returns {Map<string, Array<{ roleKey: string, roleLabel: string }>>}
 */
function mergeOrgRoleRowsForMembers(directAssignments = [], positionAssignments = []) {
  const byUser = new Map();

  const ensure = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    return byUser.get(uid);
  };

  for (const a of directAssignments || []) {
    const uid = String(a?.userId || '').trim();
    if (!uid) continue;
    pushRole(ensure(uid), a.roleKey, a.roleLabel || a.roleKey);
  }

  for (const row of positionAssignments || []) {
    const uid = String(row?.userId || '').trim();
    if (!uid) continue;
    const labels = Array.isArray(row.orgRoleLabels) ? row.orgRoleLabels : [];
    const keys = Array.isArray(row.orgRoleKeys) ? row.orgRoleKeys : [];
    if (keys.length) {
      keys.forEach((key, i) => pushRole(ensure(uid), key, labels[i] || key));
      continue;
    }
    for (const label of labels) {
      const text = String(label || '').trim();
      if (!text) continue;
      const bucket = ensure(uid);
      if (![...bucket.values()].some((r) => r.roleLabel === text)) {
        bucket.set(`label:${text}`, { roleKey: '', roleLabel: text });
      }
    }
  }

  const out = new Map();
  for (const [uid, byKey] of byUser.entries()) {
    out.set(uid, [...byKey.values()]);
  }
  return out;
}

module.exports = {
  mapOrganizationRolesByOrgId,
  listOrganizationRolesForUser,
  mergeOrgRoleRowsForMembers,
  canonRoleKey,
};
