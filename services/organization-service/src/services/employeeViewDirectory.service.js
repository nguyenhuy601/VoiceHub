const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Team = require('../models/Team');
const EmployeePositionAssignment = require('../models/EmployeePositionAssignment');
const { readStoredSystemAdminState } = require('../clients/storedSystemRole.client');
const { resolveEffectiveGrants } = require('./orgRbacMatrix.service');
const {
  attachPlacementFromStructure,
  buildDepartmentRoster,
} = require('./structurePlacement.service');
const {
  ORG_WIDE_SCOPES,
  employeeViewScope,
  filterMembersByEmployeeView,
} = require('../utils/employeeViewMemberScope');

const MEMBER_FIELDS = 'user organization role joinedAt status invitedBy createdAt updatedAt';

async function listActiveMembers(orgId) {
  return Membership.find({ organization: orgId, status: 'active' }).select(MEMBER_FIELDS).lean();
}

/**
 * Phòng của người xem: gán vị trí, làm trưởng phòng, dẫn team, hoặc đang thuộc phòng trên People Graph.
 * Không suy cả công ty khi thiếu phòng.
 */
async function viewerDepartmentIds(orgId, userId) {
  const uid = String(userId || '').trim();
  const ids = new Set();
  const [assignments, headed, ledTeams, placed] = await Promise.all([
    EmployeePositionAssignment.find({
      organizationId: orgId,
      userId: uid,
      status: 'active',
    })
      .select('departmentId')
      .lean(),
    Department.find({ organization: orgId, head: uid }).select('_id').lean(),
    Team.find({ organization: orgId, leader: uid, isActive: { $ne: false } })
      .select('department')
      .lean(),
    attachPlacementFromStructure(orgId, [{ user: uid, userId: uid }]),
  ]);

  for (const row of assignments) {
    if (row?.departmentId) ids.add(String(row.departmentId));
  }
  for (const row of headed) {
    if (row?._id) ids.add(String(row._id));
  }
  for (const row of ledTeams) {
    if (row?.department) ids.add(String(row.department));
  }
  const placedId = placed?.[0]?.departmentId;
  if (placedId) ids.add(String(placedId));
  return [...ids];
}

async function departmentRosterUserIds(orgId, departmentIds) {
  if (!departmentIds.length) return [];
  const roster = await buildDepartmentRoster(orgId, { departmentIds });
  const ids = new Set();
  for (const row of roster) {
    for (const id of row.memberIds || []) ids.add(String(id));
    for (const team of row.teams || []) {
      for (const id of team.memberIds || []) ids.add(String(id));
    }
    if (row.headId) ids.add(String(row.headId));
  }
  return [...ids];
}

/**
 * Bảng quản trị nhân sự. Danh bạ chat không đi qua hàm này.
 */
async function listMembersForEmployeeView(orgId, userId) {
  const members = await listActiveMembers(orgId);
  const stored = await readStoredSystemAdminState(userId);
  if (stored.state === 'admin') return members;

  const resolved = await resolveEffectiveGrants(orgId, userId);
  const scope = employeeViewScope(resolved?.grantScopes);
  if (ORG_WIDE_SCOPES.has(scope)) return members;

  let departmentMemberIds = [];
  if (scope === 'DEPARTMENT') {
    const departmentIds = await viewerDepartmentIds(orgId, userId);
    departmentMemberIds = await departmentRosterUserIds(orgId, departmentIds);
  }

  return filterMembersByEmployeeView({
    viewerUserId: userId,
    scope,
    departmentMemberIds,
    members,
  });
}

module.exports = {
  viewerDepartmentIds,
  listMembersForEmployeeView,
};
