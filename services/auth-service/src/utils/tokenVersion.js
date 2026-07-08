const { cacheTokenVersion } = require('@enterprise/shared/utils/tokenVersionAuth');

async function bumpTokenVersion(userAuth) {
  if (!userAuth) return 0;
  const next = Number(userAuth.tokenVersion || 0) + 1;
  userAuth.tokenVersion = next;
  if (userAuth.userId) {
    await cacheTokenVersion(String(userAuth.userId), next);
  }
  return next;
}

function accessTokenPayload(userAuth, email) {
  return {
    id: String(userAuth.userId),
    email: String(email || ''),
    tv: Number(userAuth.tokenVersion || 0),
    systemRole: String(userAuth.systemRole || 'employee').toLowerCase() === 'admin' ? 'admin' : 'employee',
    mustChangePassword: Boolean(userAuth.mustChangePassword),
  };
}

module.exports = {
  bumpTokenVersion,
  accessTokenPayload,
};
