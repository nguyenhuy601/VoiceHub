/**
 * Org Role catalog keys — UI/persona/nav (không phải gói Permission / JWT systemRole).
 */

export const MANAGER_ORG_ROLE_KEYS = new Set([
  'department_manager',
  'team_lead',
  'team_manager',
  'director',
  'resource_manager',
  'auditor',
  'organization_administrator',
]);

export const HR_ORG_ROLE_KEYS = new Set(['hr_approver']);

/**
 * @param {...unknown} sources object có myOrganizationRoles / organizationRoleKeys, hoặc mảng key/row
 * @returns {string[]}
 */
export function extractOrganizationRoleKeys(...sources) {
  const out = [];
  for (const source of sources) {
    if (!source) continue;
    const rows = Array.isArray(source)
      ? source
      : Array.isArray(source.myOrganizationRoles)
        ? source.myOrganizationRoles
        : Array.isArray(source.organizationRoleKeys)
          ? source.organizationRoleKeys
          : [];
    for (const row of rows) {
      const key = String(row?.roleKey || row?.key || row || '')
        .trim()
        .toLowerCase();
      if (key) out.push(key);
    }
  }
  return [...new Set(out)];
}

/** Badge nav từ catalog Org Role — sau membership + Position (head/leader). */
export function resolveNavRoleFromOrgKeys(keys) {
  const orgKeys = extractOrganizationRoleKeys(keys);
  if (orgKeys.includes('department_manager')) return 'deptHead';
  if (orgKeys.includes('team_lead') || orgKeys.includes('team_manager')) return 'teamLeader';
  if (orgKeys.some((k) => HR_ORG_ROLE_KEYS.has(k))) return 'hr';
  if (orgKeys.some((k) => MANAGER_ORG_ROLE_KEYS.has(k))) return 'manager';
  return '';
}
