/**
 * Huy: Nest Branch/Division/Department/Team → cây `branches[]` cho GET /structure.
 * Giữ unit orphan (branch/division/department = null) trong synthetic branch — template không có Chi nhánh.
 */

function idStr(v) {
  return String(v || '').trim();
}

/**
 * @param {{
 *   orgId?: string,
 *   branches?: object[],
 *   divisions?: object[],
 *   departments?: object[],
 *   teams?: object[],
 *   channelsByTeam?: Map,
 *   channelsByDepartment?: Map,
 *   channelsByDivision?: Map,
 * }} input
 */
function nestLegacyOrgStructure(input = {}) {
  const orgId = idStr(input.orgId) || 'org';
  const branches = Array.isArray(input.branches) ? input.branches : [];
  const divisions = Array.isArray(input.divisions) ? input.divisions : [];
  const departments = Array.isArray(input.departments) ? input.departments : [];
  const teams = Array.isArray(input.teams) ? input.teams : [];
  const channelsByTeam = input.channelsByTeam || new Map();
  const channelsByDepartment = input.channelsByDepartment || new Map();
  const channelsByDivision = input.channelsByDivision || new Map();

  const teamsByDepartment = new Map();
  const teamsByDivisionOnly = new Map();
  const rootTeams = [];

  for (const team of teams) {
    const withChannels = {
      ...team,
      channels: channelsByTeam.get(idStr(team._id)) || [],
    };
    const deptKey = idStr(team.department);
    if (deptKey) {
      if (!teamsByDepartment.has(deptKey)) teamsByDepartment.set(deptKey, []);
      teamsByDepartment.get(deptKey).push(withChannels);
      continue;
    }
    const divKey = idStr(team.division);
    if (divKey) {
      if (!teamsByDivisionOnly.has(divKey)) teamsByDivisionOnly.set(divKey, []);
      teamsByDivisionOnly.get(divKey).push(withChannels);
      continue;
    }
    rootTeams.push(withChannels);
  }

  const departmentsByDivision = new Map();
  const rootDepartments = [];

  for (const department of departments) {
    const node = {
      ...department,
      channels: channelsByDepartment.get(idStr(department._id)) || [],
      teams: teamsByDepartment.get(idStr(department._id)) || [],
    };
    const divKey = idStr(department.division);
    if (!divKey) {
      rootDepartments.push(node);
      continue;
    }
    if (!departmentsByDivision.has(divKey)) departmentsByDivision.set(divKey, []);
    departmentsByDivision.get(divKey).push(node);
  }

  const divisionsByBranch = new Map();
  const rootDivisions = [];

  for (const division of divisions) {
    const depts = [...(departmentsByDivision.get(idStr(division._id)) || [])];
    for (const team of teamsByDivisionOnly.get(idStr(division._id)) || []) {
      depts.push({
        _id: `${idStr(team._id)}-synth-dept`,
        name: `${team.name || 'Team'} (dept)`,
        isSynthetic: true,
        channels: [],
        teams: [team],
      });
    }
    const node = {
      ...division,
      channels: channelsByDivision.get(idStr(division._id)) || [],
      departments: depts,
    };
    const branchKey = idStr(division.branch);
    if (!branchKey) {
      rootDivisions.push(node);
      continue;
    }
    if (!divisionsByBranch.has(branchKey)) divisionsByBranch.set(branchKey, []);
    divisionsByBranch.get(branchKey).push(node);
  }

  const tree = branches.map((branch) => ({
    ...branch,
    divisions: divisionsByBranch.get(idStr(branch._id)) || [],
  }));

  const needsSynthetic =
    rootDivisions.length > 0 || rootDepartments.length > 0 || rootTeams.length > 0;

  if (needsSynthetic) {
    const synthDivisions = [...rootDivisions];
    const orphanDepts = [...rootDepartments];
    for (const team of rootTeams) {
      orphanDepts.push({
        _id: `${idStr(team._id)}-synth-dept`,
        name: `${team.name || 'Team'} (dept)`,
        isSynthetic: true,
        channels: [],
        teams: [team],
      });
    }
    if (orphanDepts.length) {
      synthDivisions.push({
        _id: `${orgId}-synth-division`,
        name: 'Organization',
        isSynthetic: true,
        isActive: true,
        channels: [],
        departments: orphanDepts,
      });
    }
    tree.push({
      _id: `${orgId}-synth-branch`,
      name: 'Organization',
      location: '',
      isActive: true,
      isDefault: true,
      isSynthetic: true,
      channels: [],
      divisions: synthDivisions,
    });
  }

  const divisionsFlat = divisions.map((division) => {
    const depts = [...(departmentsByDivision.get(idStr(division._id)) || [])];
    for (const team of teamsByDivisionOnly.get(idStr(division._id)) || []) {
      depts.push({
        _id: `${idStr(team._id)}-synth-dept`,
        name: `${team.name || 'Team'} (dept)`,
        isSynthetic: true,
        channels: [],
        teams: [team],
      });
    }
    return {
      ...division,
      channels: channelsByDivision.get(idStr(division._id)) || [],
      departments: depts,
    };
  });

  return { branches: tree, divisionsFlat };
}

module.exports = {
  nestLegacyOrgStructure,
};
