const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Division = require('../models/Division');
const { resolveOrgAccess } = require('../utils/orgAccess');
const { fetchUserRolesInOrg } = require('../utils/orgRoles');
const {
  resolveStructureVisibilityFromRoles,
  getRoleHierarchyLevel,
} = require('../utils/memberPlacementScope');
const {
  isMultiPlacementReadEnabled,
  resolveEffectiveScopesFromAssignments,
} = require('./memberScopePolicy.service');

/**
 * Phạm vi task workspace — khớp shell: owner/admin, head/leader,
 * RoleScopeAssignment (flag), hoặc hierarchy roles (dep_/team_/div_).
 */
async function resolveTaskWorkspaceScope(userId, orgId) {
  const uid = String(userId || '').trim();
  const oid = String(orgId || '').trim();
  if (!uid || !oid) return null;

  const access = await resolveOrgAccess(uid, oid);
  if (!access.ok) return null;

  if (access.rolesOnly && !access.membership) {
    return {
      visibility: 'self',
      canCreateTask: false,
      canUseAiTask: false,
      membershipRole: null,
      assignableUserIds: [uid],
      departmentIds: [],
      teamIds: [],
      ledTeamIds: [],
      divisionIds: [],
    };
  }

  const membership = access.membership;
  if (!membership) return null;

  const membershipRole = Membership.normalizeRole(membership.role);
  const headedDepts = await Department.find({ organization: oid, head: uid })
    .select('_id name division')
    .lean();
  const ledTeams = await Team.find({ organization: oid, leader: uid, isActive: true })
    .select('_id name department division members')
    .lean();

  let visibility = 'self';
  let canCreateTask = false;

  if (membershipRole === 'owner' || membershipRole === 'admin') {
    visibility = 'org';
    canCreateTask = true;
  } else if (headedDepts.length) {
    visibility = 'department';
    canCreateTask = true;
  } else if (ledTeams.length) {
    visibility = 'team';
    canCreateTask = true;
  } else if (membershipRole === 'hr') {
    visibility = 'org';
    canCreateTask = false;
  }

  const departmentIds = headedDepts.map((d) => String(d._id));
  /** Team user đang là leader — không bị overwrite khi expand scope phòng. */
  const leaderOfTeamIds = ledTeams.map((t) => String(t._id));
  const ledTeamIds = [...leaderOfTeamIds];
  let scopedDivisionIds = [];

  if (isMultiPlacementReadEnabled()) {
    const effectiveScopes = await resolveEffectiveScopesFromAssignments(oid, uid);
    if (effectiveScopes.teamIds.size) {
      visibility = 'team';
      canCreateTask = true;
    } else if (effectiveScopes.departmentIds.size) {
      visibility = 'department';
      canCreateTask = true;
    } else if (effectiveScopes.divisionIds.size) {
      visibility = 'division';
      canCreateTask = true;
    }
    if (membershipRole === 'owner' || membershipRole === 'admin') {
      visibility = 'org';
      canCreateTask = true;
    } else if (membershipRole === 'hr') {
      visibility = 'org';
      canCreateTask = false;
    }
    scopedDivisionIds = [...effectiveScopes.divisionIds];
    if (visibility === 'department') {
      departmentIds.splice(0, departmentIds.length, ...effectiveScopes.departmentIds);
    }
    if (visibility === 'team') {
      ledTeamIds.splice(0, ledTeamIds.length, ...effectiveScopes.teamIds);
    }
  } else if (visibility === 'self' && membershipRole !== 'hr') {
    // Khớp org shell: suy scope từ RBAC hierarchy (dep_/team_/div_).
    const [userRoles, divisions, departments, teams] = await Promise.all([
      fetchUserRolesInOrg(uid, oid),
      Division.find({ organization: oid }).select('_id name').lean(),
      Department.find({ organization: oid }).select('_id name division').lean(),
      Team.find({ organization: oid, isActive: true }).select('_id name department division').lean(),
    ]);
    const roleNames = (userRoles || []).map((r) => r.name);
    const structure = resolveStructureVisibilityFromRoles(roleNames, {
      divisions,
      departments,
      teams,
    });
    const mapped = mapStructureToTaskVisibility(structure, roleNames);
    if (mapped) {
      visibility = mapped.visibility;
      canCreateTask = mapped.canCreateTask;
      departmentIds.splice(0, departmentIds.length, ...mapped.departmentIds);
      ledTeamIds.splice(0, ledTeamIds.length, ...mapped.teamIds);
      scopedDivisionIds = mapped.divisionIds;
    }
  }

  let departmentTeamIds = [];
  if (departmentIds.length) {
    const teamsInDept = await Team.find({
      organization: oid,
      department: { $in: departmentIds },
      isActive: true,
    })
      .select('_id')
      .lean();
    departmentTeamIds = teamsInDept.map((t) => String(t._id));
  }

  const teamIds =
    visibility === 'department'
      ? [...new Set([...ledTeamIds, ...departmentTeamIds])]
      : ledTeamIds;

  const assignableUserIds = await collectAssignableUserIds(oid, visibility, {
    divisionIds: scopedDivisionIds,
    departmentIds,
    teamIds,
    ledTeams,
  });

  return {
    visibility,
    canCreateTask,
    canUseAiTask: canCreateTask,
    membershipRole,
    departmentIds,
    teamIds,
    /** Team mà user là Team.leader (chuẩn vàng: chỉ TL gán NV trên epic team). */
    ledTeamIds: leaderOfTeamIds,
    divisionIds: scopedDivisionIds,
    divisionId: scopedDivisionIds[0] || null,
    departmentId: departmentIds[0] || null,
    teamId: teamIds[0] || null,
    assignableUserIds,
  };
}

function mapStructureToTaskVisibility(structure, roleNames) {
  if (!structure || structure.mode === 'none') return null;
  const departmentIds = [...(structure.departmentIds || [])];
  const teamIds = [...(structure.teamIds || [])];
  const divisionIds = [...(structure.divisionIds || [])];

  if (structure.mode === 'team') {
    return { visibility: 'team', canCreateTask: true, departmentIds, teamIds, divisionIds };
  }
  if (structure.mode === 'department') {
    return { visibility: 'department', canCreateTask: true, departmentIds, teamIds, divisionIds };
  }
  if (structure.mode === 'division') {
    return { visibility: 'division', canCreateTask: true, departmentIds, teamIds, divisionIds };
  }
  if (structure.mode === 'multi') {
    const levels = new Set(
      (roleNames || []).map((n) => getRoleHierarchyLevel(n)).filter(Boolean)
    );
    if (levels.has('department')) {
      return { visibility: 'department', canCreateTask: true, departmentIds, teamIds, divisionIds };
    }
    if (levels.has('division')) {
      return { visibility: 'division', canCreateTask: true, departmentIds, teamIds, divisionIds };
    }
    if (levels.has('team') || teamIds.length) {
      return { visibility: 'team', canCreateTask: true, departmentIds, teamIds, divisionIds };
    }
  }
  return null;
}

async function collectAssignableUserIds(orgId, visibility, { divisionIds, departmentIds, teamIds, ledTeams }) {
  const ids = new Set();

  if (visibility === 'org') {
    const rows = await Membership.find({ organization: orgId, status: 'active' }).select('user').lean();
    for (const row of rows) {
      if (row?.user) ids.add(String(row.user));
    }
    return [...ids];
  }

  if (visibility === 'department' && departmentIds.length) {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      $or: [
        { department: { $in: departmentIds } },
        ...(teamIds.length ? [{ team: { $in: teamIds } }] : []),
      ],
    })
      .select('user')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    if (teamIds.length) {
      const teams = await Team.find({ _id: { $in: teamIds } }).select('members leader').lean();
      for (const team of teams) {
        if (team?.leader) ids.add(String(team.leader));
        for (const m of team.members || []) {
          if (m) ids.add(String(m));
        }
      }
    }
    return [...ids];
  }

  if (visibility === 'division') {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      ...(Array.isArray(divisionIds) && divisionIds.length
        ? { division: { $in: divisionIds } }
        : {}),
    })
      .select('user division')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    return [...ids];
  }

  if (visibility === 'team' && teamIds.length) {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      team: { $in: teamIds },
    })
      .select('user')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    for (const team of ledTeams) {
      if (team?.leader) ids.add(String(team.leader));
      for (const m of team.members || []) {
        if (m) ids.add(String(m));
      }
    }
    const teams = await Team.find({ _id: { $in: teamIds } }).select('members leader').lean();
    for (const team of teams) {
      if (team?.leader) ids.add(String(team.leader));
      for (const m of team.members || []) {
        if (m) ids.add(String(m));
      }
    }
    return [...ids];
  }

  return [];
}

module.exports = { resolveTaskWorkspaceScope };
