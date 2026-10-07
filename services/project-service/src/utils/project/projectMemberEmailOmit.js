/**
 * Role-aware omit of member emails for non-admin consumers.
 */

/**
 * @param {object|object[]|null} members
 * @returns {object|object[]|null}
 */
function omitMemberEmails(members) {
  if (members == null) return members;
  if (Array.isArray(members)) {
    return members.map((row) => omitMemberEmails(row));
  }
  if (typeof members !== 'object') return members;

  const out = { ...members };
  delete out.email;
  if (out.user && typeof out.user === 'object') {
    const user = { ...out.user };
    delete user.email;
    out.user = user;
  }
  return out;
}

/**
 * Admin-class: org owner/admin, project creator, or project matrix admin-capable.
 * @param {{ userId: string, project: object, canAdminProject?: boolean, membershipRole?: string }} opts
 */
function canSeeMemberEmails(opts = {}) {
  const userId = String(opts.userId || '').trim();
  const project = opts.project && typeof opts.project === 'object' ? opts.project : {};
  if (!userId) return false;
  if (opts.canAdminProject === true) return true;
  if (String(project.createdBy || '') === userId) return true;
  const role = String(opts.membershipRole || '').toLowerCase();
  if (role === 'owner' || role === 'admin') return true;
  return false;
}

module.exports = {
  omitMemberEmails,
  canSeeMemberEmails,
};
