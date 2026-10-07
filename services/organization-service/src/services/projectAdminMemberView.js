/**
 * Wave P / Wave 1 — allowlist DTO cho members projection.
 * view=directory | admin_table; caller nên mặc định admin_table khi thiếu view.
 */

const { maskEmail } = require('../utils/orgErrorMap');

const VIEW_DIRECTORY = 'directory';
const VIEW_ADMIN_TABLE = 'admin_table';

/** Auth / platform flags — chỉ admin_table (không lộ qua directory). */
const DIRECTORY_OMIT = new Set([
  'mustChangePassword',
  'isLocked',
  'lastLoginAt',
  'systemRole',
  'rbacRoles',
]);

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

/** Directory cho member thường (không owner/admin/hr/employee.view): không lộ liên hệ đầy đủ / trạng thái tài khoản. */
const DIRECTORY_CONTACT_OMIT = ['employeeCode', 'isActive'];

/**
 * @param {object} member — đã enrich + placement
 * @param {string} view — directory | admin_table | ''
 * @param {{ restrictContact?: boolean }} [options]
 * @returns {object}
 */
function projectMemberForView(member, view, { restrictContact = false } = {}) {
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
    capabilityStatus: member.capabilityStatus || 'draft',
    departmentId,
    departmentName: member.departmentName ?? null,
    teamId,
  };

  if (v === VIEW_ADMIN_TABLE) {
    out.mustChangePassword = member.mustChangePassword;
    out.isLocked = member.isLocked;
    out.lastLoginAt = member.lastLoginAt || null;
    out.systemRole = member.systemRole || 'employee';
    out.rbacRoles = slimRbacRoles(member.rbacRoles);
  }

  // directory: explicit omit (defense in depth if fields were copied above)
  if (v === VIEW_DIRECTORY) {
    for (const key of DIRECTORY_OMIT) {
      if (Object.prototype.hasOwnProperty.call(out, key)) delete out[key];
    }
    if (restrictContact) {
      for (const key of DIRECTORY_CONTACT_OMIT) delete out[key];
      out.email = out.email ? maskEmail(out.email) : null;
    }
  }

  return out;
}

/**
 * @param {object[]} members
 * @param {string} view
 * @param {{ restrictContact?: boolean }} [options]
 * @returns {object[]}
 */
function projectMembersForView(members, view, options = {}) {
  const list = Array.isArray(members) ? members : [];
  const v = normalizeView(view);
  if (!v) return list;
  return list.map((m) => projectMemberForView(m, v, options));
}

module.exports = {
  VIEW_DIRECTORY,
  VIEW_ADMIN_TABLE,
  DIRECTORY_OMIT,
  DIRECTORY_CONTACT_OMIT,
  normalizeView,
  projectMemberForView,
  projectMembersForView,
  slimRbacRoles,
};
