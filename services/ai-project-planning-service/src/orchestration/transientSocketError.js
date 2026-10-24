const TRANSIENT_SOCKET_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNABORTED',
]);

/**
 * Socket blips from Redis/HTTP must not be treated as a fatal process error.
 * node-redis emits "read ECONNRESET" when the peer is killed (for example redis-lg OOM).
 * @param {unknown} error
 * @returns {boolean}
 */
function isTransientSocketError(error) {
  const code = String(error && typeof error === 'object' ? error.code || '' : '').trim();
  if (TRANSIENT_SOCKET_CODES.has(code)) return true;
  const message = String(
    error && typeof error === 'object' && error.message ? error.message : ''
  );
  return /^(read|write) (ECONNRESET|EPIPE|ETIMEDOUT)$/.test(message)
    || /^connect ECONNREFUSED\b/.test(message);
}

module.exports = {
  isTransientSocketError,
};
