/** Huy: Gate vào workspace — member chưa xếp phòng ban/nhóm thì chưa đủ điều kiện. */

const ELEVATED_ORG_ROLES = new Set(['owner', 'admin', 'hr']);

/**
 * @param {string|null|undefined} myRole — membership role
 * @param {{
 *   canSeeAllStructure?: boolean,
 *   departmentId?: string|null,
 *   teamId?: string|null,
 *   scopedDepartmentIds?: string[],
 *   scopedTeamIds?: string[],
 * }|null|undefined} scope — shell access.scope
 */
export function isOrgMemberAccessIncomplete(myRole, scope = {}) {
  const role = String(myRole || 'member').trim().toLowerCase();
  if (ELEVATED_ORG_ROLES.has(role)) return false;
  if (scope?.canSeeAllStructure) return false;

  const hasDept = Boolean(String(scope?.departmentId || '').trim());
  const hasTeam = Boolean(String(scope?.teamId || '').trim());
  const scopedDepts = Array.isArray(scope?.scopedDepartmentIds)
    ? scope.scopedDepartmentIds.filter(Boolean)
    : [];
  const scopedTeams = Array.isArray(scope?.scopedTeamIds)
    ? scope.scopedTeamIds.filter(Boolean)
    : [];

  if (hasDept || hasTeam || scopedDepts.length > 0 || scopedTeams.length > 0) {
    return false;
  }
  return true;
}
