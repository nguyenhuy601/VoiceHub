/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
export function unitId(row) {
  return String(row?._id || row?.id || '').trim();
}

export function unitName(row, fallback = '—') {
  return String(row?.name || '').trim() || fallback;
}

/** Flatten getStructure → departments / teams / branches / divisions. */
export function flattenOrgStructure(structure) {
  const branches = [];
  const divisions = [];
  const departments = [];
  const teams = [];

  for (const branch of structure?.branches || []) {
    const branchId = unitId(branch);
    branches.push({
      ...branch,
      id: branchId,
      _id: branchId,
    });
    for (const division of branch?.divisions || []) {
      const divisionId = unitId(division);
      divisions.push({
        ...division,
        id: divisionId,
        _id: divisionId,
        branchId,
        branchName: unitName(branch),
      });
      for (const department of division?.departments || []) {
        const departmentId = unitId(department);
        departments.push({
          ...department,
          id: departmentId,
          _id: departmentId,
          branchId,
          branchName: unitName(branch),
          divisionId,
          divisionName: unitName(division),
          headId: String(department?.head?._id || department?.head || '').trim() || null,
          memberIds: (department?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
          teamCount: Array.isArray(department?.teams) ? department.teams.length : 0,
        });
        for (const team of department?.teams || []) {
          const teamId = unitId(team);
          teams.push({
            ...team,
            id: teamId,
            _id: teamId,
            branchId,
            branchName: unitName(branch),
            divisionId,
            divisionName: unitName(division),
            departmentId,
            departmentName: unitName(department),
            leaderId: String(team?.leader?._id || team?.leader || '').trim() || null,
            memberIds: (team?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
            isActive: team?.isActive !== false,
          });
        }
      }
    }
  }

  return { branches, divisions, departments, teams };
}

export function unwrapOrgApi(payload) {
  const body = payload?.data ?? payload;
  if (body?.data !== undefined) return body.data;
  return body;
}
