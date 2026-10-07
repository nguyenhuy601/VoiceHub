/**
 * JWT cho gọi user-scoped: ưu tiên header Authorization, fallback handshake.auth.token.
 */
function resolveSocketAuthHeader(socket) {
  const fromHeader = String(socket?.handshake?.headers?.authorization || '').trim();
  if (fromHeader) return fromHeader;
  const token = String(socket?.handshake?.auth?.token || '').trim();
  if (!token) return '';
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

module.exports = { resolveSocketAuthHeader };
