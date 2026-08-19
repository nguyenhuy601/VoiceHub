/**
 * Quyết định authorizeOrGrant — tách khỏi mongoose để unit test.
 * Membership owner/admin bypass; member (hoặc đã vào org qua RBAC) cần grant V2.
 */
function resolveAuthorizeOrGrant({ membership, normalizedRole, roles, grantAllowed, orgAccessOk = false }) {
  const allowedRoles = Array.isArray(roles) ? roles : [];
  if (membership && allowedRoles.includes(normalizedRole)) {
    return { allow: true, via: 'membership' };
  }
  if (grantAllowed && (membership || orgAccessOk)) {
    return { allow: true, via: 'grant' };
  }
  return { allow: false, via: null };
}

module.exports = { resolveAuthorizeOrGrant };
