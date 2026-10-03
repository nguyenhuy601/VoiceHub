/**
 * Member không có ChannelAccess / role ACL: họp trên kênh phòng
 * (team null) hoặc kênh team mình đang thuộc.
 */
function userHasTeamInDepartment(teamIds, depId, teamDepartmentByTeamId) {
  const targetDep = String(depId || '');
  if (!targetDep || !teamIds || !teamIds.size) return false;
  for (const tid of teamIds) {
    if (String(teamDepartmentByTeamId.get(String(tid)) || '') === targetDep) return true;
  }
  return false;
}

function shouldGrantDefaultMemberOrgChannelAccess(
  channel,
  structureVisibility,
  teamDepartmentByTeamId = null
) {
  if (!channel || !structureVisibility) return false;
  const teamId = channel.team ? String(channel.team) : '';
  const depId = channel.department ? String(channel.department) : '';
  const teamIds = structureVisibility.teamIds;
  const departmentIds = structureVisibility.departmentIds;
  if (teamId) {
    return Boolean(teamIds && typeof teamIds.has === 'function' && teamIds.has(teamId));
  }
  if (!depId) return false;
  if (departmentIds && typeof departmentIds.has === 'function' && departmentIds.has(depId)) {
    return true;
  }
  const teamDeptMap =
    teamDepartmentByTeamId instanceof Map
      ? teamDepartmentByTeamId
      : null;
  if (!teamDeptMap) return false;
  return userHasTeamInDepartment(teamIds, depId, teamDeptMap);
}

module.exports = {
  shouldGrantDefaultMemberOrgChannelAccess,
};
