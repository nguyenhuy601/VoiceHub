/** Phạm vi phòng ban / team mà thành viên được gán — dùng cho meeting notify scope. */

export function parseMembershipScopeFromAccess(scope = {}) {
  const scopedDepartmentIds = Array.isArray(scope.scopedDepartmentIds)
    ? scope.scopedDepartmentIds.map(String).filter(Boolean)
    : [];
  const scopedTeamIds = Array.isArray(scope.scopedTeamIds)
    ? scope.scopedTeamIds.map(String).filter(Boolean)
    : [];

  return {
    departmentId: scope.departmentId ? String(scope.departmentId) : null,
    teamId: scope.teamId ? String(scope.teamId) : null,
    canSeeAllStructure: Boolean(scope.canSeeAllStructure),
    structureMode: String(scope.structureMode || 'none'),
    scopedDepartmentIds,
    scopedTeamIds,
  };
}

export function getMyAssignedDepartmentIds(membershipScope) {
  if (!membershipScope) return [];
  const ids = new Set();
  if (membershipScope.departmentId) ids.add(String(membershipScope.departmentId));
  for (const id of membershipScope.scopedDepartmentIds || []) {
    if (id) ids.add(String(id));
  }
  return Array.from(ids);
}

export function getMyAssignedTeamIds(membershipScope) {
  if (!membershipScope) return [];
  const ids = new Set();
  if (membershipScope.teamId) ids.add(String(membershipScope.teamId));
  for (const id of membershipScope.scopedTeamIds || []) {
    if (id) ids.add(String(id));
  }
  return Array.from(ids);
}

export function hasMyOrgStructureAssignment(membershipScope) {
  return (
    getMyAssignedDepartmentIds(membershipScope).length > 0 ||
    getMyAssignedTeamIds(membershipScope).length > 0
  );
}

function unitId(row) {
  return String(row?._id || row?.id || '').trim();
}

export function flattenOrgStructureDepartments(structureSummary) {
  const branches = structureSummary?.branches;
  if (!Array.isArray(branches)) return [];
  const out = [];
  const seen = new Set();
  for (const branch of branches) {
    for (const division of branch?.divisions || []) {
      for (const department of division?.departments || []) {
        const id = unitId(department);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(department);
      }
    }
  }
  return out;
}

export function flattenOrgStructureTeams(structureSummary) {
  const branches = structureSummary?.branches;
  if (!Array.isArray(branches)) return [];
  const out = [];
  const seen = new Set();
  for (const branch of branches) {
    for (const division of branch?.divisions || []) {
      for (const department of division?.departments || []) {
        for (const team of department?.teams || []) {
          const id = unitId(team);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          out.push(team);
        }
      }
    }
  }
  return out;
}

export function filterStructureUnitsForMember(units, allowedIds) {
  const allowed = new Set((allowedIds || []).map(String));
  if (!allowed.size) return [];
  return (units || []).filter((row) => allowed.has(unitId(row)));
}

export function resolveMyMeetingNotifyUnits({ structureSummary, membershipScope } = {}) {
  const allDepartments = flattenOrgStructureDepartments(structureSummary);
  const allTeams = flattenOrgStructureTeams(structureSummary);
  const departmentIds = getMyAssignedDepartmentIds(membershipScope);
  const teamIds = getMyAssignedTeamIds(membershipScope);

  return {
    departments: filterStructureUnitsForMember(allDepartments, departmentIds),
    teams: filterStructureUnitsForMember(allTeams, teamIds),
    hasDepartmentAssignment: departmentIds.length > 0,
    hasTeamAssignment: teamIds.length > 0,
    hasAnyAssignment: departmentIds.length > 0 || teamIds.length > 0,
  };
}
