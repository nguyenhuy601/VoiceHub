/**
 * Tick quyền vai trò tổ chức và gắn 11 vị trí.
 * Chỉ thêm mã còn thiếu. Không gắn director vào vị trí dùng chung.
 */

const OrganizationalRole = require('../models/OrganizationalRole');
const OrganizationalPosition = require('../models/OrganizationalPosition');
const OrgRolePermission = require('../models/OrgRolePermission');
const PositionRoleBinding = require('../models/PositionRoleBinding');
const EmployeePositionAssignment = require('../models/EmployeePositionAssignment');
const UserOrgRoleGrant = require('../models/UserOrgRoleGrant');
const { MASTER_POSITIONS } = require('@enterprise/shared/config/masterData');
const { invalidatePermissionCacheForUsers } = require('./grantPermissionCache');

const MEMBER_CODE = 'member';
const MEMBER_DISPLAY_NAME = 'Thành viên tổ chức';

const CHAT = [
  ['communication.chat.view', 'ORGANIZATION'],
  ['communication.chat.send', 'ORGANIZATION'],
];

const ROLE_GRANTS = Object.freeze({
  member: [
    ['organization.employee.view', 'SELF'],
    ...CHAT,
  ],
  team_lead: [
    ['organization.employee.view', 'DEPARTMENT'],
    ['organization.department.view', 'DEPARTMENT'],
    ['organization.team.view', 'DEPARTMENT'],
    ...CHAT,
  ],
  department_manager: [
    ['organization.employee.view', 'DEPARTMENT'],
    ['organization.department.view', 'DEPARTMENT'],
    ['organization.team.view', 'DEPARTMENT'],
    ['organization.employee.invite', 'DEPARTMENT'],
    ['organization.employee.update', 'DEPARTMENT'],
    ['organization.structure.view', 'DEPARTMENT'],
    ['project.project.create', 'ORGANIZATION'],
    ...CHAT,
  ],
  director: [
    ['organization.employee.view', 'ORGANIZATION'],
    ['organization.employee.update', 'ORGANIZATION'],
    ['organization.department.view', 'ORGANIZATION'],
    ['organization.department.update', 'ORGANIZATION'],
    ['organization.team.view', 'ORGANIZATION'],
    ['organization.team.update', 'ORGANIZATION'],
    ['organization.position.view', 'ORGANIZATION'],
    ['organization.position.update', 'ORGANIZATION'],
    ['organization.organization_role.view', 'ORGANIZATION'],
    ['organization.organization_role.update', 'ORGANIZATION'],
    ['organization.structure.view', 'ORGANIZATION'],
    ['organization.structure.update', 'ORGANIZATION'],
    ['organization.policy.update', 'ORGANIZATION'],
    ['system.audit.view', 'ORGANIZATION'],
    ['project.project.create', 'ORGANIZATION'],
  ],
  resource_manager: [
    ['organization.employee.view', 'ORGANIZATION'],
    ['organization.department.view', 'ORGANIZATION'],
    ['organization.team.view', 'ORGANIZATION'],
    ['organization.position.view', 'ORGANIZATION'],
    ['project.project.create', 'ORGANIZATION'],
  ],
  hr_approver: [
    ['organization.employee.view', 'ORGANIZATION'],
    ['organization.employee.invite', 'ORGANIZATION'],
    ['organization.employee.update', 'ORGANIZATION'],
    ['organization.employee.disable', 'ORGANIZATION'],
    ['organization.department.view', 'ORGANIZATION'],
  ],
  auditor: [
    ['organization.employee.view', 'ORGANIZATION'],
    ['organization.department.view', 'ORGANIZATION'],
    ['organization.team.view', 'ORGANIZATION'],
    ['organization.position.view', 'ORGANIZATION'],
    ['organization.organization_role.view', 'ORGANIZATION'],
    ['organization.structure.view', 'ORGANIZATION'],
    ['organization.policy.view', 'ORGANIZATION'],
    ['system.audit.view', 'ORGANIZATION'],
  ],
  mentor: [
    ['organization.employee.view', 'DEPARTMENT'],
    ...CHAT,
  ],
});

const ROLE_NAMES = Object.freeze({
  member: MEMBER_DISPLAY_NAME,
  team_lead: 'Trưởng nhóm',
  department_manager: 'Trưởng phòng',
  director: 'Giám đốc tổ chức',
  resource_manager: 'Quản lý nguồn lực',
  hr_approver: 'Nhân sự',
  auditor: 'Kiểm toán',
  mentor: 'Mentor',
});

/** Vị trí HR → một vai trò tổ chức. Director không nằm ở đây. */
const POSITION_ROLE_CODE = Object.freeze({
  engineering_manager: 'department_manager',
  team_lead: 'team_lead',
  product_manager: 'resource_manager',
  business_analyst: MEMBER_CODE,
  software_developer: MEMBER_CODE,
  qa_engineer: MEMBER_CODE,
  ux_designer: MEMBER_CODE,
  devops_engineer: MEMBER_CODE,
  scrum_master: MEMBER_CODE,
  technical_lead: MEMBER_CODE,
  intern: MEMBER_CODE,
});

const ensuredOrgs = new Set();

const ALLOWLIST_MEMBER_NAME = MEMBER_DISPLAY_NAME;
const TRIM_PREFIXES = ['organization.', 'project.', 'system.'];

/** org_member và tên hiển thị thành viên vẫn là vai trò member. Mã viết hoa không được hạ chữ. */
function normalizeAllowlistRoleCode(role) {
  const code = String(role?.code || role || '').trim();
  const name = String(role?.name || '').trim();
  if (code === 'org_member' || name === ALLOWLIST_MEMBER_NAME) return 'member';
  return code;
}

function roleIsOnAllowlist(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_GRANTS, normalizeAllowlistRoleCode(role));
}

function tickShouldBeRemoved(roleCode, permissionCode) {
  const code = String(permissionCode || '').trim().toLowerCase();
  if (!TRIM_PREFIXES.some((prefix) => code.startsWith(prefix))) return false;
  const baselineCode = normalizeAllowlistRoleCode(roleCode);
  const pairs = ROLE_GRANTS[baselineCode];
  if (!pairs) return false;
  return !pairs.some(([permission]) => permission === code);
}

function grantsOf(roleCode) {
  return ROLE_GRANTS[roleCode] || [];
}

function hasCode(roleCode, permissionCode) {
  return grantsOf(roleCode).some(([code]) => code === permissionCode);
}

async function ensureRole(organizationId, code, sortOrder) {
  const name = ROLE_NAMES[code] || code;
  let row = await OrganizationalRole.findOne({ organizationId, code }).lean();
  if (!row && code === MEMBER_CODE) {
    row = await OrganizationalRole.findOne({
      organizationId,
      name: { $in: ['Member', 'member', 'Thành viên', MEMBER_DISPLAY_NAME] },
    }).lean();
  }
  if (!row) {
    row = (
      await OrganizationalRole.create({
        organizationId,
        code,
        name,
        status: 'active',
        sortOrder,
      })
    ).toObject();
    return { row, created: true };
  }
  const expectedName = ROLE_NAMES[code] || (code === MEMBER_CODE ? MEMBER_DISPLAY_NAME : null);
  if (expectedName && row.name !== expectedName) {
    row = await OrganizationalRole.findOneAndUpdate(
      { _id: row._id },
      { $set: { name: expectedName } },
      { new: true }
    ).lean();
  }
  return { row, created: false };
}

async function ensureMissingTicks(organizationId, roleId, entries) {
  let inserted = 0;
  for (const [permissionCode, scopeType] of entries) {
    const res = await OrgRolePermission.updateOne(
      { organizationId, roleId, permissionCode },
      { $setOnInsert: { organizationId, roleId, permissionCode, scopeType } },
      { upsert: true }
    );
    if (res.upsertedCount) inserted += 1;
  }
  return inserted;
}

async function ensurePositionBinding(organizationId, positionCode, roleId) {
  const def = MASTER_POSITIONS.find((row) => row.key === positionCode);
  let position = await OrganizationalPosition.findOne({ organizationId, code: positionCode }).lean();
  if (!position) {
    position = (
      await OrganizationalPosition.create({
        organizationId,
        code: positionCode,
        name: def?.label || positionCode,
        status: 'active',
        sortOrder: def?.sortOrder || 100,
      })
    ).toObject();
  }
  const existing = await PositionRoleBinding.find({
    organizationId,
    positionId: position._id,
  })
    .select('roleId')
    .lean();
  const already =
    existing.length === 1 && String(existing[0].roleId) === String(roleId);
  if (already) return position._id;
  await PositionRoleBinding.deleteMany({ organizationId, positionId: position._id });
  await PositionRoleBinding.create({
    organizationId,
    positionId: position._id,
    roleId,
    isDefault: true,
  });
  return position._id;
}

async function trimExtraOrgTicks(organizationId, roleId, roleCode) {
  const rows = await OrgRolePermission.find({ organizationId, roleId })
    .select('_id permissionCode')
    .lean();
  const removeIds = rows
    .filter((row) => tickShouldBeRemoved(roleCode, row.permissionCode))
    .map((row) => row._id);
  if (!removeIds.length) return 0;
  const res = await OrgRolePermission.deleteMany({ _id: { $in: removeIds } });
  return res.deletedCount || removeIds.length;
}

async function dropBindingsOutsideAllowlist(organizationId) {
  const bindings = await PositionRoleBinding.find({ organizationId }).select('_id roleId').lean();
  if (!bindings.length) return 0;
  const roleIds = [...new Set(bindings.map((row) => String(row.roleId)).filter(Boolean))];
  const roles = await OrganizationalRole.find({ _id: { $in: roleIds } })
    .select('_id code name')
    .lean();
  const allowed = new Set(roles.filter((role) => roleIsOnAllowlist(role)).map((role) => String(role._id)));
  const dropIds = bindings.filter((row) => !allowed.has(String(row.roleId))).map((row) => row._id);
  if (!dropIds.length) return 0;
  const res = await PositionRoleBinding.deleteMany({ _id: { $in: dropIds } });
  return res.deletedCount || dropIds.length;
}

async function ensureOrgRoleGrantBaseline(organizationId) {
  const orgKey = String(organizationId || '').trim();
  if (!orgKey || ensuredOrgs.has(orgKey)) return { skipped: true };

  const roleByCode = new Map();
  let sort = 10;
  for (const code of Object.keys(ROLE_GRANTS)) {
    const { row } = await ensureRole(organizationId, code, sort);
    sort += 10;
    roleByCode.set(code, row);
    await ensureMissingTicks(organizationId, row._id, ROLE_GRANTS[code]);
  }

  const allowlistedRoles = await OrganizationalRole.find({ organizationId })
    .select('_id code name')
    .lean();
  let removedTicks = 0;
  for (const role of allowlistedRoles) {
    if (!roleIsOnAllowlist(role)) continue;
    removedTicks += await trimExtraOrgTicks(
      organizationId,
      role._id,
      normalizeAllowlistRoleCode(role)
    );
  }
  const removedBindings = await dropBindingsOutsideAllowlist(organizationId);
  if (removedTicks || removedBindings) {
    const { logger } = require('@enterprise/shared');
    logger.info('[orgRoleGrantBaseline] trimmed leftover grants', {
      organizationId: orgKey,
      removedTicks,
      removedBindings,
    });
    const [activeAssignments, personalGrants] = await Promise.all([
      EmployeePositionAssignment.find({ organizationId, status: 'active' }).select('userId').lean(),
      UserOrgRoleGrant.find({ organizationId }).select('userId').lean(),
    ]);
    await invalidatePermissionCacheForUsers(organizationId, [
      ...activeAssignments.map((row) => row.userId),
      ...personalGrants.map((row) => row.userId),
    ]);
  }

  const touchedPositionIds = [];
  for (const [positionCode, roleCode] of Object.entries(POSITION_ROLE_CODE)) {
    const role = roleByCode.get(roleCode);
    if (!role) continue;
    const positionId = await ensurePositionBinding(organizationId, positionCode, role._id);
    touchedPositionIds.push(positionId);
  }

  const assignments = touchedPositionIds.length
    ? await EmployeePositionAssignment.find({
        organizationId,
        positionId: { $in: touchedPositionIds },
        status: 'active',
      })
        .select('userId')
        .lean()
    : [];
  await invalidatePermissionCacheForUsers(
    organizationId,
    assignments.map((row) => row.userId)
  );

  ensuredOrgs.add(orgKey);
  return { skipped: false };
}

module.exports = {
  ROLE_GRANTS,
  POSITION_ROLE_CODE,
  MEMBER_DISPLAY_NAME,
  grantsOf,
  hasCode,
  normalizeAllowlistRoleCode,
  roleIsOnAllowlist,
  tickShouldBeRemoved,
  ensureOrgRoleGrantBaseline,
};
