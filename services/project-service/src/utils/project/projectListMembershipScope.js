/**
 * Org elevated roles may list all org projects.
 * Regular users only see projects they belong to (membership / creator).
 */

function isOrgElevatedMembershipRole(membershipRole) {
  const role = String(membershipRole || '').trim().toLowerCase();
  return role === 'owner' || role === 'admin';
}

/**
 * @param {object} base - Mongo filter already scoped to org (and isActive, etc.)
 * @param {import('mongoose').Types.ObjectId} userOid
 * @param {import('mongoose').Types.ObjectId[]} memberProjectIds
 */
function memberScopedProjectFilter(base, userOid, memberProjectIds = []) {
  const accessOr = [{ createdBy: userOid }];
  if (Array.isArray(memberProjectIds) && memberProjectIds.length) {
    accessOr.push({ _id: { $in: memberProjectIds } });
  }
  return { ...base, $or: accessOr };
}

module.exports = {
  isOrgElevatedMembershipRole,
  memberScopedProjectFilter,
};
