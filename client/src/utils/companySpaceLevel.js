/**
 * Company suite L2 — department (default) vs team context.
 * Pure helpers; shell + URL are sources of truth.
 */

import {
  flattenOrgStructureDepartments,
  flattenOrgStructureTeams,
  getMyAssignedDepartmentIds,
  getMyAssignedTeamIds,
  parseMembershipScopeFromAccess,
} from './orgMemberStructureScope.js';

export const COMPANY_SPACE_LEVEL = {
  DEPARTMENT: 'department',
  TEAM: 'team',
};

export const LAST_COMPANY_TEAM_ID_KEY = 'voicehub:last-company-team-id';

export function normalizeCompanySpaceLevel(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === COMPANY_SPACE_LEVEL.TEAM) return COMPANY_SPACE_LEVEL.TEAM;
  return COMPANY_SPACE_LEVEL.DEPARTMENT;
}

function unitId(row) {
  if (row == null || row === '') return '';
  if (typeof row === 'object') return String(row._id || row.id || '').trim();
  return String(row).trim();
}

function unitName(row) {
  if (!row || typeof row !== 'object') return '';
  return String(row.name || row.title || '').trim();
}

/**
 * RULE-01: single department — primary scope.departmentId, else first scopedDepartmentIds.
 * @param {object} [shell] — org shell payload (access.scope)
 * @returns {string}
 */
export function resolveMyDepartmentId(shell) {
  const scope = parseMembershipScopeFromAccess(shell?.access?.scope || shell?.scope || {});
  if (scope.departmentId) return String(scope.departmentId);
  const ids = getMyAssignedDepartmentIds(scope);
  return ids[0] ? String(ids[0]) : '';
}

/**
 * Teams the user may select (scoped + primary), optionally limited to a department.
 * @param {object} [shell]
 * @param {string} [departmentId]
 * @returns {{ id: string, name: string, departmentId: string }[]}
 */
export function listMyTeamsFromShell(shell, departmentId = '') {
  const scope = parseMembershipScopeFromAccess(shell?.access?.scope || shell?.scope || {});
  const allowed = new Set(getMyAssignedTeamIds(scope));
  const seeAll = Boolean(scope.canSeeAllStructure);
  if (!allowed.size && !seeAll) return [];

  const structure = shell?.structureSummary || shell?.structure || null;
  const deptFilter = String(departmentId || '').trim();
  const out = [];
  const seen = new Set();

  const branches = structure?.branches;
  if (Array.isArray(branches)) {
    for (const branch of branches) {
      for (const division of branch?.divisions || []) {
        for (const department of division?.departments || []) {
          const deptId = unitId(department);
          if (deptFilter && deptId && deptId !== deptFilter) continue;
          for (const team of department?.teams || []) {
            const id = unitId(team);
            if (!id || seen.has(id)) continue;
            if (!seeAll && !allowed.has(id)) continue;
            seen.add(id);
            out.push({
              id,
              name: unitName(team) || id,
              departmentId: deptId || deptFilter,
            });
          }
        }
      }
    }
  }

  // Fallback: flat list without tree walk
  if (!out.length) {
    for (const team of flattenOrgStructureTeams(structure)) {
      const id = unitId(team);
      if (!id || seen.has(id)) continue;
      if (!seeAll && !allowed.has(id)) continue;
      const teamDept = String(team.department || team.departmentId || '').trim();
      if (deptFilter && teamDept && teamDept !== deptFilter) continue;
      seen.add(id);
      out.push({
        id,
        name: unitName(team) || id,
        departmentId: teamDept || deptFilter,
      });
    }
  }

  // Scope may list teams not yet in structureSummary — keep id-only entries
  for (const id of allowed) {
    if (seeAll) break;
    if (seen.has(id)) continue;
    if (deptFilter) {
      // without tree info we cannot prove dept membership; still include when no dept filter mismatch possible
    }
    seen.add(id);
    out.push({ id, name: id, departmentId: deptFilter });
  }

  return out;
}

export function resolveDepartmentLabel(shell, departmentId) {
  const id = String(departmentId || '').trim();
  if (!id) return '';
  const structure = shell?.structureSummary || shell?.structure || null;
  const dept = flattenOrgStructureDepartments(structure).find((d) => unitId(d) === id);
  return unitName(dept) || id;
}

export function resolveTeamLabel(shell, teamId) {
  const id = String(teamId || '').trim();
  if (!id) return '';
  const structure = shell?.structureSummary || shell?.structure || null;
  const team = flattenOrgStructureTeams(structure).find((t) => unitId(t) === id);
  return unitName(team) || id;
}

/**
 * Validate teamId against user's assigned teams (and optional department).
 */
export function isValidCompanyTeamId(shell, teamId, departmentId = '') {
  const id = String(teamId || '').trim();
  if (!id) return false;
  return listMyTeamsFromShell(shell, departmentId).some((t) => t.id === id);
}

/**
 * Derive level + effective teamId from URL/storage candidates.
 * RULE-02/03: team level only when teamId is valid.
 */
export function resolveCompanySpaceLevel({
  shell,
  departmentId = '',
  teamIdFromUrl = '',
  teamIdFromStorage = '',
  preferTeam = false,
} = {}) {
  const deptId = String(departmentId || resolveMyDepartmentId(shell) || '').trim();
  const fromUrl = String(teamIdFromUrl || '').trim();
  const fromStore = String(teamIdFromStorage || '').trim();

  const candidate = fromUrl || (preferTeam ? fromStore : '');
  if (candidate && isValidCompanyTeamId(shell, candidate, deptId)) {
    return {
      level: COMPANY_SPACE_LEVEL.TEAM,
      departmentId: deptId,
      teamId: candidate,
    };
  }

  return {
    level: COMPANY_SPACE_LEVEL.DEPARTMENT,
    departmentId: deptId,
    teamId: '',
  };
}

export function readStoredCompanyTeamId() {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(LAST_COMPANY_TEAM_ID_KEY) || '').trim();
}

export function writeStoredCompanyTeamId(teamId) {
  if (typeof window === 'undefined') return;
  const id = String(teamId || '').trim();
  if (id) window.localStorage.setItem(LAST_COMPANY_TEAM_ID_KEY, id);
  else window.localStorage.removeItem(LAST_COMPANY_TEAM_ID_KEY);
}

/**
 * Search params for company module routes (OrganizationsPage hydrate).
 * @param {{ organizationId?: string, departmentId?: string, teamId?: string, level?: string }} space
 * @param {'home'|'chat'|'documents'|'calendar'|'approvals'} module
 */
export function buildCompanyModuleSearch(space, module) {
  const orgId = String(space?.organizationId || '').trim();
  const deptId = String(space?.departmentId || '').trim();
  const teamId = String(space?.teamId || '').trim();
  const level = normalizeCompanySpaceLevel(space?.level);
  const mod = String(module || '').trim().toLowerCase();

  const params = new URLSearchParams();
  void orgId; // single-company: org resolved from WorkspaceContext, not URL
  if (deptId) params.set('departmentId', deptId);
  if (level === COMPANY_SPACE_LEVEL.TEAM && teamId) {
    params.set('teamId', teamId);
  }

  if (mod === 'chat') {
    // Dept chat module uses announcement channel under the hood; UI is chat-only on /app/company/chat.
    params.set('tab', level === COMPANY_SPACE_LEVEL.TEAM && teamId ? 'chat' : 'announcement');
  } else if (mod === 'documents') {
    params.set('tab', 'documents');
  } else if (mod === 'calendar') {
    // Keep teamId in URL for L2 context; OrganizationsPage forces dept calendar on /calendar route
    params.set('tab', 'calendar');
  }

  return params;
}

export function companyModuleSearchToString(space, module) {
  const qs = buildCompanyModuleSearch(space, module).toString();
  return qs ? `?${qs}` : '';
}

/** Query `teamId` thắng workspace phòng — không xóa đuôi team khi F5. */
export function preferCompanyTeamFromSearch(teamIdFromQuery = '') {
  return Boolean(String(teamIdFromQuery || '').trim());
}

export function preferCompanyDepartmentWorkspace({
  departmentIdFromQuery = '',
  teamIdFromQuery = '',
} = {}) {
  return (
    Boolean(String(departmentIdFromQuery || '').trim()) &&
    !preferCompanyTeamFromSearch(teamIdFromQuery)
  );
}

/**
 * Cây structure đã có teams để validate teamId trên URL.
 * Cây rỗng / phòng chưa gắn teams → chưa kết luận (giữ teamId).
 */
export function isCompanyStructureReadyForTeamCheck(shell, departmentId = '') {
  const structure = shell?.structureSummary || shell?.structure || null;
  const branches = structure?.branches;
  if (!Array.isArray(branches) || branches.length === 0) return false;
  const deptFilter = String(departmentId || '').trim();
  let sawMatchingDept = false;
  let teamCount = 0;
  for (const branch of branches) {
    for (const division of branch?.divisions || []) {
      for (const department of division?.departments || []) {
        const deptId = unitId(department);
        if (deptFilter && deptId && deptId !== deptFilter) continue;
        sawMatchingDept = true;
        teamCount += Array.isArray(department?.teams) ? department.teams.length : 0;
      }
    }
  }
  return sawMatchingDept && teamCount > 0;
}

/**
 * F5/hydrate: URL đã có teamId thì không để SpaceContext DEPARTMENT xóa đuôi team.
 * @param {URLSearchParams} desired
 * @param {URLSearchParams|{get?: Function}|string} currentSearch
 * @param {string} [module]
 */
export function preserveCompanyTeamIdOnModuleSearch(desired, currentSearch, module = '') {
  const next = new URLSearchParams(desired);
  const readTeamId = () => {
    if (!currentSearch) return '';
    if (typeof currentSearch.get === 'function') {
      return String(currentSearch.get('teamId') || '').trim();
    }
    return String(currentSearch.teamId || currentSearch || '').trim();
  };
  const urlTeamId = readTeamId();
  if (urlTeamId && !String(next.get('teamId') || '').trim()) {
    next.set('teamId', urlTeamId);
    if (String(module || '').trim().toLowerCase() === 'chat') {
      next.set('tab', 'chat');
    }
  }
  return next;
}

/**
 * User vừa đổi team trên URL (Be-1 → Be-2) trong khi SpaceContext còn team cũ:
 * giữ teamId trên URL, không ghi đè bằng space.
 */
export function preferUrlTeamIdWhenAhead(desired, currentSearch) {
  const next = new URLSearchParams(desired);
  const urlTeamId = (() => {
    if (!currentSearch) return '';
    if (typeof currentSearch.get === 'function') {
      return String(currentSearch.get('teamId') || '').trim();
    }
    return String(currentSearch.teamId || '').trim();
  })();
  const desiredTeamId = String(next.get('teamId') || '').trim();
  if (urlTeamId && desiredTeamId && urlTeamId !== desiredTeamId) {
    next.set('teamId', urlTeamId);
  }
  return next;
}
