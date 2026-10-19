/**
 * Permissions that must not appear on org-role assign / by-domain SoT surfaces.
 * Branch & Division stay in org-structure admin, not org-role grants.
 */
export function isHiddenOrgRolePermission(permissionCode) {
  const code = String(permissionCode || '').trim();
  if (!code) return false;
  return code.startsWith('organization.branch.') || code.startsWith('organization.division.');
}

/**
 * Filter catalog tree modules/permissions for org-role UI.
 * @param {Array} groups — { modules: [{ permissions: [{ key }] }] }
 */
export function filterHiddenOrgRolePermissionGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((cat) => ({
      ...cat,
      modules: (Array.isArray(cat.modules) ? cat.modules : [])
        .map((mod) => ({
          ...mod,
          permissions: (Array.isArray(mod.permissions) ? mod.permissions : []).filter(
            (p) => !isHiddenOrgRolePermission(p.key || p.code)
          ),
        }))
        .filter((mod) => mod.permissions.length),
    }))
    .filter((cat) => cat.modules.length);
}
