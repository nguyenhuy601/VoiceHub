/**
 * People Graph placement — SSOT cho “đã xếp phòng/nhóm”:
 * Department.members / Team.members (không phụ thuộc RBAC dep_).
 */
const Department = require('../models/Department');
const Team = require('../models/Team');

function normalizeId(raw) {
  return String(raw?._id || raw || '').trim();
}

function emptyPlacement() {
  return {
    departmentIds: [],
    teamIds: [],
    divisionIds: [],
    primaryDepartmentId: null,
    primaryTeamId: null,
    departmentName: null,
    teamName: null,
  };
}

/**
 * Pure: build user→placement maps from lean department/team rows.
 * @param {object[]} departments
 * @param {object[]} teams
 */
function buildPlacementMaps(departments = [], teams = []) {
  /** @type {Map<string, { departmentId: string, departmentName: string, divisionId: string|null }>} */
  const deptByUser = new Map();
  /** @type {Map<string, { teamId: string, teamName: string, departmentId: string|null }>} */
  const teamByUser = new Map();
  const deptMeta = new Map();

  for (const dep of departments || []) {
    const depId = normalizeId(dep._id || dep.id);
    if (!depId) continue;
    const depName = String(dep.name || '').trim();
    const divisionId = dep.division ? normalizeId(dep.division) : null;
    deptMeta.set(depId, { name: depName, divisionId });
    const headId = dep.head ? normalizeId(dep.head) : null;
    if (headId && !deptByUser.has(headId)) {
      deptByUser.set(headId, { departmentId: depId, departmentName: depName, divisionId });
    }
    for (const mid of dep.members || []) {
      const uid = normalizeId(mid);
      if (!uid || deptByUser.has(uid)) continue;
      deptByUser.set(uid, { departmentId: depId, departmentName: depName, divisionId });
    }
  }

  for (const team of teams || []) {
    const teamId = normalizeId(team._id || team.id);
    if (!teamId) continue;
    const teamName = String(team.name || '').trim();
    const departmentId = team.department ? normalizeId(team.department) : null;
    for (const mid of team.members || []) {
      const uid = normalizeId(mid);
      if (!uid) continue;
      if (!teamByUser.has(uid)) {
        teamByUser.set(uid, { teamId, teamName, departmentId });
      }
      if (departmentId && !deptByUser.has(uid)) {
        const meta = deptMeta.get(departmentId);
        deptByUser.set(uid, {
          departmentId,
          departmentName: meta?.name || null,
          divisionId: meta?.divisionId || null,
        });
      }
    }
  }

  return { deptByUser, teamByUser };
}

/**
 * @param {Map} deptByUser
 * @param {Map} teamByUser
 * @param {string} userId
 */
function placementFromMaps(deptByUser, teamByUser, userId) {
  const uid = normalizeId(userId);
  if (!uid) return emptyPlacement();
  const dept = deptByUser.get(uid) || null;
  const team = teamByUser.get(uid) || null;

  const departmentIds = dept?.departmentId ? [dept.departmentId] : [];
  const teamIds = team?.teamId ? [team.teamId] : [];
  const divisionIds = dept?.divisionId ? [dept.divisionId] : [];

  return {
    departmentIds,
    teamIds,
    divisionIds,
    primaryDepartmentId: dept?.departmentId || null,
    primaryTeamId: team?.teamId || null,
    departmentName: dept?.departmentName || null,
    teamName: team?.teamName || null,
  };
}

function isStructureMembersInShellScopeEnabled() {
  return String(process.env.STRUCTURE_MEMBERS_IN_SHELL_SCOPE || '1').trim() !== '0';
}

/**
 * Merge People Graph placement into shell structureVisibility (mutates visibility sets).
 * @returns {{ merged: boolean }}
 */
function mergeStructureMembersIntoVisibility(structureVisibility, placement) {
  if (!structureVisibility || structureVisibility.mode === 'all') {
    return { merged: false };
  }
  const place = placement || emptyPlacement();
  let merged = false;
  for (const id of place.divisionIds || []) {
    if (!id) continue;
    structureVisibility.divisionIds.add(String(id));
    merged = true;
  }
  for (const id of place.departmentIds || []) {
    if (!id) continue;
    structureVisibility.departmentIds.add(String(id));
    merged = true;
  }
  for (const id of place.teamIds || []) {
    if (!id) continue;
    structureVisibility.teamIds.add(String(id));
    merged = true;
  }
  if (merged && structureVisibility.mode === 'none') {
    structureVisibility.mode = 'structure_members';
  }
  return { merged };
}

/**
 * @param {string} organizationId
 * @param {string} userId
 */
async function findPlacementByStructureMembers(organizationId, userId) {
  const oid = normalizeId(organizationId);
  const uid = normalizeId(userId);
  if (!oid || !uid) return emptyPlacement();

  const [departments, teams] = await Promise.all([
    Department.find({ organization: oid }).select('_id name members division head').lean(),
    Team.find({ organization: oid, isActive: { $ne: false } })
      .select('_id name department members')
      .lean(),
  ]);

  const maps = buildPlacementMaps(departments, teams);
  return placementFromMaps(maps.deptByUser, maps.teamByUser, uid);
}

/**
 * Batch for admin member list.
 * @returns {Map<string, ReturnType<typeof emptyPlacement>>}
 */
async function mapPlacementByUserIds(organizationId, userIds = []) {
  const oid = normalizeId(organizationId);
  const ids = [...new Set((userIds || []).map(normalizeId).filter(Boolean))];
  /** @type {Map<string, ReturnType<typeof emptyPlacement>>} */
  const out = new Map();
  if (!oid || !ids.length) return out;

  const [departments, teams] = await Promise.all([
    Department.find({ organization: oid }).select('_id name members division head').lean(),
    Team.find({ organization: oid, isActive: { $ne: false } })
      .select('_id name department members')
      .lean(),
  ]);

  const maps = buildPlacementMaps(departments, teams);
  for (const uid of ids) {
    out.set(uid, placementFromMaps(maps.deptByUser, maps.teamByUser, uid));
  }
  return out;
}

/**
 * Enrich admin member rows with department/team from People Graph.
 */
async function attachPlacementFromStructure(orgId, members) {
  const list = Array.isArray(members) ? members : [];
  if (!orgId || !list.length) return list;

  const userIds = list.map((m) => normalizeId(m.userId || m.user?._id || m.user));
  const byUser = await mapPlacementByUserIds(orgId, userIds);

  return list.map((member) => {
    const userId = normalizeId(member.userId || member.user?._id || member.user);
    const place = byUser.get(userId) || emptyPlacement();
    const department =
      normalizeId(member.department || member.departmentId) || place.primaryDepartmentId || null;
    const team = normalizeId(member.team || member.teamId) || place.primaryTeamId || null;
    return {
      ...member,
      department: department || null,
      departmentId: department || null,
      departmentName: department
        ? place.departmentName || member.departmentName || null
        : null,
      team: team || null,
      teamId: team || null,
    };
  });
}

/**
 * Department roster for capacity / planner / pool (People Graph: dept.members + team inherit).
 * Additive `teams[]` so pool can fill placement.teamId/teamName without a new route.
 * @returns {Promise<Array<{
 *   departmentId: string,
 *   name: string,
 *   headId: string|null,
 *   memberIds: string[],
 *   teams: Array<{ teamId: string, name: string, memberIds: string[] }>
 * }>>}
 */
async function buildDepartmentRoster(organizationId, { departmentIds } = {}) {
  const orgId = normalizeId(organizationId);
  if (!orgId) return [];

  const deptFilter = { organization: orgId, isActive: { $ne: false } };
  const filterIds = (Array.isArray(departmentIds) ? departmentIds : [])
    .map(normalizeId)
    .filter(Boolean);
  if (filterIds.length) {
    deptFilter._id = { $in: filterIds };
  }

  const [departments, teams] = await Promise.all([
    Department.find(deptFilter).select('_id name head members isActive').lean(),
    Team.find({ organization: orgId, isActive: { $ne: false } })
      .select('_id name department members')
      .lean(),
  ]);

  const { deptByUser } = buildPlacementMaps(departments, teams);
  /** @type {Map<string, Set<string>>} */
  const membersByDept = new Map();
  /** @type {Map<string, Array<{ teamId: string, name: string, memberIds: string[] }>>} */
  const teamsByDept = new Map();

  for (const dep of departments) {
    const depId = normalizeId(dep._id);
    if (!depId) continue;
    membersByDept.set(depId, new Set());
    teamsByDept.set(depId, []);
  }

  for (const [uid, place] of deptByUser.entries()) {
    const depId = place?.departmentId;
    if (!depId || !membersByDept.has(depId)) continue;
    membersByDept.get(depId).add(uid);
  }
  // head luôn thuộc headcount phòng
  for (const dep of departments) {
    const depId = normalizeId(dep._id);
    const headId = dep.head ? normalizeId(dep.head) : null;
    if (depId && headId && membersByDept.has(depId)) {
      membersByDept.get(depId).add(headId);
    }
  }

  for (const team of teams || []) {
    const teamId = normalizeId(team._id);
    const departmentId = team.department ? normalizeId(team.department) : null;
    if (!teamId || !departmentId || !teamsByDept.has(departmentId)) continue;
    const memberIds = [...new Set((team.members || []).map(normalizeId).filter(Boolean))];
    teamsByDept.get(departmentId).push({
      teamId,
      name: String(team.name || '').trim(),
      memberIds,
    });
  }

  return departments.map((dep) => {
    const departmentId = normalizeId(dep._id);
    return {
      departmentId,
      name: String(dep.name || '').trim(),
      headId: dep.head ? normalizeId(dep.head) : null,
      memberIds: [...(membersByDept.get(departmentId) || [])],
      teams: teamsByDept.get(departmentId) || [],
    };
  });
}

module.exports = {
  normalizeId,
  emptyPlacement,
  buildPlacementMaps,
  placementFromMaps,
  isStructureMembersInShellScopeEnabled,
  mergeStructureMembersIntoVisibility,
  findPlacementByStructureMembers,
  mapPlacementByUserIds,
  attachPlacementFromStructure,
  buildDepartmentRoster,
};
