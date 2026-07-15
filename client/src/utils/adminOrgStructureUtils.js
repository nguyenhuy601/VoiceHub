/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
export function unitId(row) {
  return String(row?._id || row?.id || '').trim();
}

export function unitName(row, fallback = '—') {
  return String(row?.name || '').trim() || fallback;
}

function pushUnique(list, seen, row) {
  const id = unitId(row);
  if (!id || seen.has(id)) return false;
  seen.add(id);
  list.push(row);
  return true;
}

/** Chỉ phòng ban thật — bỏ synthetic / khối / chi nhánh lẫn từ OU tree. */
function isRealDepartmentNode(row) {
  if (row?.isSynthetic) return false;
  const levelKey = String(row?.levelKey || '').trim().toLowerCase();
  if (levelKey && levelKey !== 'department') return false;
  return true;
}

/** Walk một nhánh division → đẩy vào lists (dedupe theo id). */
function ingestDivision(division, lists, ctx = {}) {
  const { divisions, departments, teams, seenDiv, seenDep, seenTeam } = lists;
  const divisionId = unitId(division);
  const branchId = ctx.branchId || '';
  const branchName = ctx.branchName || '';

  pushUnique(divisions, seenDiv, {
    ...division,
    id: divisionId,
    _id: divisionId,
    branchId: branchId || division.branchId || '',
    branchName: branchName || division.branchName || '',
  });

  for (const department of division?.departments || []) {
    const departmentId = unitId(department);
    const isSynthDept = Boolean(department?.isSynthetic);
    if (!isSynthDept && isRealDepartmentNode(department)) {
      pushUnique(departments, seenDep, {
        ...department,
        id: departmentId,
        _id: departmentId,
        branchId: branchId || '',
        branchName: branchName || '',
        divisionId,
        divisionName: unitName(division),
        headId: String(department?.head?._id || department?.head || '').trim() || null,
        memberIds: (department?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
        teamCount: Array.isArray(department?.teams) ? department.teams.length : 0,
        isActive: department?.isActive !== false,
      });
    }
    for (const team of department?.teams || []) {
      const teamId = unitId(team);
      pushUnique(teams, seenTeam, {
        ...team,
        id: teamId,
        _id: teamId,
        branchId: branchId || '',
        branchName: branchName || '',
        divisionId,
        divisionName: unitName(division),
        departmentId: isSynthDept ? '' : departmentId,
        departmentName: isSynthDept ? '' : unitName(department),
        leaderId: String(team?.leader?._id || team?.leader || '').trim() || null,
        memberIds: (team?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
        isActive: team?.isActive !== false,
      });
    }
  }
}

/** Flatten getStructure → departments / teams / branches / divisions. */
export function flattenOrgStructure(structure) {
  const branches = [];
  const divisions = [];
  const departments = [];
  const teams = [];
  const seenBranch = new Set();
  const seenDiv = new Set();
  const seenDep = new Set();
  const seenTeam = new Set();
  const lists = { divisions, departments, teams, seenDiv, seenDep, seenTeam };

  for (const branch of structure?.branches || []) {
    const branchId = unitId(branch);
    if (branchId && !branch.isSynthetic) {
      pushUnique(branches, seenBranch, {
        ...branch,
        id: branchId,
        _id: branchId,
      });
    }
    for (const division of branch?.divisions || []) {
      if (division?.isSynthetic) {
        for (const department of division?.departments || []) {
          const departmentId = unitId(department);
          if (!isRealDepartmentNode(department)) continue;
          pushUnique(departments, seenDep, {
            ...department,
            id: departmentId,
            _id: departmentId,
            branchId: '',
            branchName: '',
            divisionId: '',
            divisionName: '',
            headId: String(department?.head?._id || department?.head || '').trim() || null,
            memberIds: (department?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
            teamCount: Array.isArray(department?.teams) ? department.teams.length : 0,
          });
          for (const team of department?.teams || []) {
            const teamId = unitId(team);
            pushUnique(teams, seenTeam, {
              ...team,
              id: teamId,
              _id: teamId,
              branchId: '',
              branchName: '',
              divisionId: '',
              divisionName: '',
              departmentId: department?.isSynthetic ? '' : departmentId,
              departmentName: department?.isSynthetic ? '' : unitName(department),
              leaderId: String(team?.leader?._id || team?.leader || '').trim() || null,
              memberIds: (team?.members || []).map((m) => String(m?._id || m || '').trim()).filter(Boolean),
              isActive: team?.isActive !== false,
            });
          }
        }
        continue;
      }
      ingestDivision(division, lists, {
        branchId: branch.isSynthetic ? '' : branchId,
        branchName: branch.isSynthetic ? '' : unitName(branch),
      });
    }
  }

  // Huy: prefer-OU đã đủ; merge divisionsFlat gây trùng tên (OU id ≠ Division id)
  if (structure?.structureSource !== 'ou') {
    for (const division of structure?.divisionsFlat || []) {
      if (division?.isSynthetic) continue;
      ingestDivision(division, lists, {
        branchId: unitId(division.branch) || '',
        branchName: '',
      });
    }
  }

  return { branches, divisions, departments, teams };
}

export function unwrapOrgApi(payload) {
  const body = payload?.data ?? payload;
  if (body?.data !== undefined) return body.data;
  return body;
}
