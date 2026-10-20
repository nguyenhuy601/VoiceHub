/**
 * Quyết định authorizeOrGrant — tách khỏi mongoose để unit test.
 * Membership owner/admin/hr không phải quyền. Chỉ grant V2, hoặc stored systemRole=admin
 * đã đối chiếu DB (mọi masterKey khi orgAccessOk).
 */
function resolveAuthorizeOrGrant({
  membership,
  grantAllowed,
  orgAccessOk = false,
  storedAdminVerified = false,
}) {
  if (storedAdminVerified) {
    return { allow: true, via: 'stored-admin' };
  }
  if (grantAllowed && (membership || orgAccessOk)) {
    return { allow: true, via: 'grant' };
  }
  return { allow: false, via: null };
}

module.exports = { resolveAuthorizeOrGrant };
