/**
 * Wave P — allowlist DTO cho GET members/with-roles?view=directory|admin_table.
 * Không view → caller giữ enrich đầy đủ (backward compatible).
 */

const VIEW_DIRECTORY = 'directory';
const VIEW_ADMIN_TABLE = 'admin_table';

function normalizeView(view) {
  const v = String(view || '').trim().toLowerCase();
  if (v === VIEW_DIRECTORY || v === VIEW_ADMIN_TABLE) return v;
  return '';
}

function refId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value._id || value.id || value.departmentId || value.teamId;
    const s = String(id || '').trim();
    return s || null;
  }
  const s = String(value).trim();
  return s || null;
}

function pickOrgRole(member) {
  const role = String(member?.role || member?.orgRole || 'member').trim().toLowerCase();
  return role || 'member';
}

function slimRbacRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.map((row) => {
    if (!row || typeof row !== 'object') return { name: String(row || '') };
    const id = String(row._id || row.id || row.roleId || '').trim() || undefined;
    const name = String(row.name || row.role?.name || '').trim() || null;
    const out = { name };
    if (id) out._id = id;
    if (row.role && typeof row.role === 'object' && row.role.name) {
      out.role = { name: String(row.role.name) };
    }
    return out;
  });
}

/**
 * @param {object} member — đã enrich + placement
 * @param {string} view — directory | admin_table | ''
 * @returns {object}
 */
function projectMemberForView(member, view) {
  const v = normalizeView(view);
  if (!v || !member || typeof member !== 'object') return member;

  const userId =
    String(member.userId || member.user?._id || member.user || '').trim() || null;
  const departmentId = refId(member.departmentId) || refId(member.department);
  const teamId = refId(member.teamId) || refId(member.team);

  const out = {
    userId,
    displayName: member.displayName ?? null,
    email: member.email ?? null,
    username: member.username ?? null,
    avatar: member.avatar ?? null,
    employeeCode: member.employeeCode ?? null,
    jobTitle: member.jobTitle ?? null,
    role: pickOrgRole(member),
    isActive: member.isActive,
    mustChangePassword: member.mustChangePassword,
    isLocked: member.isLocked,
    lastLoginAt: member.lastLoginAt || null,
    systemRole: member.systemRole || 'employee',
    capabilityStatus: member.capabilityStatus || 'draft',
    departmentId,
    departmentName: member.departmentName ?? null,
    teamId,
  };

  if (v === VIEW_ADMIN_TABLE) {
    out.rbacRoles = slimRbacRoles(member.rbacRoles);
  }

  return out;
}

/**
 * @param {object[]} members
 * @param {string} view
 * @returns {object[]}
 */
function projectMembersForView(members, view) {
  const list = Array.isArray(members) ? members : [];
  const v = normalizeView(view);
  if (!v) return list;
  return list.map((m) => projectMemberForView(m, v));
}

module.exports = {
  VIEW_DIRECTORY,
  VIEW_ADMIN_TABLE,
  normalizeView,
  projectMemberForView,
  projectMembersForView,
  slimRbacRoles,
};
