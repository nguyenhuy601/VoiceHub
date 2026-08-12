/**
 * Collab shell / workspace — ai được xem toàn cấu trúc (mode: all).
 * People Ops (directory/placement) KHÔNG dùng helper này — HR vẫn org-wide ở đó.
 */

/**
 * @param {string|null|undefined} membershipRole
 * @param {string[]|null|undefined} roleNames — RBAC names (executive)
 * @param {(names: string[]) => boolean} [hasExecutive]
 * @returns {boolean}
 */
function isCollabStructureAdmin(membershipRole, roleNames, hasExecutive) {
  const normalized = String(membershipRole || '')
    .trim()
    .toLowerCase();
  if (normalized === 'owner' || normalized === 'admin') return true;
  if (typeof hasExecutive === 'function' && hasExecutive(roleNames || [])) return true;
  return false;
}

/**
 * Gộp scope structural (dept/team membership) vào visibility từ roles.
 * @param {{ mode?: string, divisionIds?: Set<string>, departmentIds?: Set<string>, teamIds?: Set<string> }} base
 * @param {{ divisionIds?: Set<string>, departmentIds?: Set<string>, teamIds?: Set<string> }} structural
 */
function mergeStructuralIntoVisibility(base, structural) {
  const divisionIds = new Set([...(base?.divisionIds || []), ...(structural?.divisionIds || [])]);
  const departmentIds = new Set([
    ...(base?.departmentIds || []),
    ...(structural?.departmentIds || []),
  ]);
  const teamIds = new Set([...(base?.teamIds || []), ...(structural?.teamIds || [])]);

  let mode = base?.mode || 'none';
  if (mode === 'all') {
    return { mode: 'all', divisionIds: new Set(), departmentIds: new Set(), teamIds: new Set() };
  }
  if (mode === 'none') {
    if (teamIds.size || departmentIds.size || divisionIds.size) {
      mode = 'multi';
    }
  }

  return { mode, divisionIds, departmentIds, teamIds };
}

module.exports = {
  isCollabStructureAdmin,
  mergeStructuralIntoVisibility,
};
