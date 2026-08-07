import { flattenOrgStructure, unitId, unitName } from '../../utils/adminOrgStructureUtils';
import { ORGANIZATION_ROLE_LABELS, PROJECT_ROLE_LABELS } from '../../utils/roleTaxonomy';
import { resolveOrgRolesForUser } from '../../utils/userTaxonomyUtils';

/**
 * Resolve department/team display names from org shell structure + access.scope.
 */
export function resolvePlacementFromShell(shell, userId) {
  const scope = shell?.access?.scope || {};
  const branches = shell?.structureSummary?.branches || [];
  const flat = flattenOrgStructure({ branches });
  const departmentId = String(scope.departmentId || '').trim();
  const teamId = String(scope.teamId || '').trim();
  const divisionId = String(scope.divisionId || '').trim();

  const department =
    flat.departments.find((d) => unitId(d) === departmentId) || null;
  const team = flat.teams.find((t) => unitId(t) === teamId) || null;
  const division = flat.divisions.find((d) => unitId(d) === divisionId) || null;

  const structureRoles = resolveOrgRolesForUser(userId, flat.departments, flat.teams);

  return {
    departmentId: departmentId || null,
    departmentName: department ? unitName(department) : '',
    teamId: teamId || null,
    teamName: team ? unitName(team) : '',
    divisionId: divisionId || null,
    divisionName: division ? unitName(division) : '',
    memberReady: Boolean(shell?.access?.memberReady),
    structureRoles,
    flat,
  };
}

export function labelForOrgRoleKey(roleKey, t) {
  const key = String(roleKey || '').trim().toLowerCase();
  if (!key) return '';
  const fromTaxonomy = ORGANIZATION_ROLE_LABELS[key];
  if (fromTaxonomy) return fromTaxonomy;
  const path = `dashboard.personalOrgRole.${key}`;
  const translated = t?.(path);
  if (translated && translated !== path) return translated;
  return key.replace(/_/g, ' ');
}

export function labelForProjectRoleKey(roleKey) {
  const key = String(roleKey || '').trim().toLowerCase();
  if (!key) return '';
  return PROJECT_ROLE_LABELS[key] || key.replace(/_/g, ' ');
}

export function labelForMembershipRole(role, t) {
  const key = String(role || '').trim().toLowerCase();
  if (!key) return t?.('dashboard.personalMembershipUnknown') || '—';
  const path = `dashboard.personalMembership.${key}`;
  const translated = t?.(path);
  if (translated && translated !== path) return translated;
  return key;
}

/**
 * Merge catalog assignments + People Graph head/leader into display rows.
 */
export function mergePersonalOrgRoles({ assignments = [], structureRoles = [], t }) {
  const rows = [];
  const seen = new Set();

  for (const a of assignments) {
    const roleKey = String(a.roleKey || a.key || '').trim().toLowerCase();
    if (!roleKey) continue;
    const id = `assign-${roleKey}-${a._id || a.id || roleKey}`;
    if (seen.has(roleKey)) continue;
    seen.add(roleKey);
    rows.push({
      id,
      roleKey,
      label: String(a.label || a.roleLabel || '').trim() || labelForOrgRoleKey(roleKey, t),
      source: 'catalog',
    });
  }

  for (const r of structureRoles) {
    const roleKey = String(r.roleKey || '').trim().toLowerCase();
    if (!roleKey || seen.has(roleKey)) continue;
    seen.add(roleKey);
    rows.push({
      id: r.id || `struct-${roleKey}`,
      roleKey,
      label: labelForOrgRoleKey(roleKey, t),
      scopeName: r.scopeName || '',
      source: 'structure',
    });
  }

  return rows;
}

export function filterMyProjects(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .filter((p) => Boolean(p?.myMembership?.isMember))
    .map((p) => ({
      projectId: String(p.projectId || p._id || '').trim(),
      title: String(p.title || p.name || '').trim() || '—',
      projectCode: String(p.projectCode || '').trim(),
      status: String(p.status || '').trim(),
      projectRoleKeys: Array.isArray(p.myMembership?.projectRoleKeys)
        ? p.myMembership.projectRoleKeys.map(String).filter(Boolean)
        : [],
      defaultBoardId: String(p.defaultBoardId || '').trim(),
    }))
    .filter((p) => p.projectId);
}
