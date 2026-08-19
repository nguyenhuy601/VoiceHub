/**
 * Directory visibility for GET /members — permission user.view + Role.scope,
 * not Membership.role owner/admin/hr.
 */
const { resolveUserHierarchyScopes } = require('./memberPlacementScope');

const VIEW_ACTIONS = new Set(['view', 'read', '*', 'admin']);
const ORG_WIDE_SCOPES = new Set(['ORGANIZATION', 'GLOBAL']);
const UNIT_SCOPES = new Set(['DEPARTMENT', 'TEAM']);

function normalizeScope(role) {
  return String(role?.scope || '')
    .trim()
    .toUpperCase();
}

function roleGrantsUserView(role) {
  const perms = Array.isArray(role?.permissions) ? role.permissions : [];
  for (const perm of perms) {
    const resource = String(perm?.resource || '').trim();
    if (resource !== 'user' && resource !== '*') continue;
    const actions = Array.isArray(perm.actions) ? perm.actions : [];
    if (actions.some((a) => VIEW_ACTIONS.has(String(a || '').trim().toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function emptyUnits() {
  return { departmentIds: [], teamIds: [], divisionIds: [] };
}

/**
 * @param {Array<{ name?: string, scope?: string, permissions?: object[] }>} roles
 * @param {{ divisions?: object[], departments?: object[], teams?: object[] }} [structure]
 * @returns {{ mode: 'all' | 'units' | 'assignment', departmentIds: string[], teamIds: string[], divisionIds: string[] }}
 */
function resolveMemberDirectoryAccess(roles, structure = {}) {
  const list = Array.isArray(roles) ? roles : [];
  const viewing = list.filter(roleGrantsUserView);
  if (!viewing.length) {
    return { mode: 'assignment', ...emptyUnits() };
  }
  if (viewing.some((r) => ORG_WIDE_SCOPES.has(normalizeScope(r)))) {
    return { mode: 'all', ...emptyUnits() };
  }
  const unitRoles = viewing.filter((r) => UNIT_SCOPES.has(normalizeScope(r)));
  if (!unitRoles.length) {
    return { mode: 'assignment', ...emptyUnits() };
  }
  const scopes = resolveUserHierarchyScopes(
    unitRoles.map((r) => r.name).filter(Boolean),
    {
      divisions: structure.divisions || [],
      departments: structure.departments || [],
      teams: structure.teams || [],
    }
  );
  return {
    mode: 'units',
    departmentIds: [...(scopes.departmentIds || [])].map(String),
    teamIds: [...(scopes.teamIds || [])].map(String),
    divisionIds: [...(scopes.divisionIds || [])].map(String),
  };
}

function directoryAllowsDepartmentQuery(access, requestedIds = [], extraAllowedIds = []) {
  const mode = access?.mode || 'assignment';
  const requested = [...new Set((requestedIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!requested.length) return false;
  if (mode === 'all') return true;
  const allowed = new Set(
    [
      ...(access?.departmentIds || []),
      ...(access?.teamIds || []),
      ...(access?.divisionIds || []),
      ...(extraAllowedIds || []),
    ].map((id) => String(id))
  );
  return requested.some((id) => allowed.has(id));
}

function memberInDirectoryUnits(member, access, viewerUserId) {
  const uid = String(member?.user?._id || member?.user || member?.userId || '');
  if (uid && uid === String(viewerUserId || '')) return true;
  const deptSet = new Set((access?.departmentIds || []).map(String));
  const teamSet = new Set((access?.teamIds || []).map(String));
  const divSet = new Set((access?.divisionIds || []).map(String));
  const dept = String(member?.departmentId || member?.department || '');
  const team = String(member?.teamId || member?.team || '');
  const div = String(member?.divisionId || member?.division || '');
  return Boolean(
    (dept && deptSet.has(dept)) || (team && teamSet.has(team)) || (div && divSet.has(div))
  );
}

module.exports = {
  roleGrantsUserView,
  resolveMemberDirectoryAccess,
  directoryAllowsDepartmentQuery,
  memberInDirectoryUnits,
};
