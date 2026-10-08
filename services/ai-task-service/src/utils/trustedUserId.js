/**
 * User id from gateway-trusted req.user only — never raw x-user-id header.
 * @param {import('express').Request} req
 * @returns {string}
 */
function requireTrustedUserId(req) {
  return String(req.user?.id || '').trim();
}

module.exports = {
  requireTrustedUserId,
};
