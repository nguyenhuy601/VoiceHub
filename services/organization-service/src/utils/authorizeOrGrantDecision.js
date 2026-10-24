/**
 * Quyết định authorizeOrGrant — tách khỏi mongoose để unit test.
 * Membership owner/admin/hr không phải quyền. Grant V2, hoặc cờ system admin
 * do route đặt sẵn. Middleware chỉ tự đối chiếu system admin trên mã .view.
 */
/** Bên bán chỉ tự qua mã xem. Mã sửa phải có grant, trừ khi route đã đặt cờ. */
function isVendorViewGrant(masterKey) {
  return String(masterKey || '').trim().toLowerCase().endsWith('.view');
}

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

module.exports = { resolveAuthorizeOrGrant, isVendorViewGrant };
