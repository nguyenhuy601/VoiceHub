const crypto = require('crypto');
const { JWT_REFRESH_SECRET } = require('../config/jwt');

function getRefreshPepper() {
  return String(process.env.REFRESH_TOKEN_PEPPER || JWT_REFRESH_SECRET || '').trim();
}

function hashRefreshToken(raw) {
  const token = String(raw || '').trim();
  if (!token) return '';
  const pepper = getRefreshPepper();
  return crypto.createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

/** So khớp refresh token (hash mới hoặc plaintext legacy trong DB). */
function refreshTokenMatches(userAuth, incomingRaw) {
  const stored = String(userAuth?.refreshToken || '').trim();
  const incoming = String(incomingRaw || '').trim();
  if (!stored || !incoming) return false;
  if (stored === incoming) return true;
  return stored === hashRefreshToken(incoming);
}

module.exports = {
  hashRefreshToken,
  refreshTokenMatches,
};
