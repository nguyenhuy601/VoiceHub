const crypto = require('crypto');

const FORBIDDEN_KEYS = new Set([
  'password',
  'newPassword',
  'oldPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'resetUrl',
  'email',
]);

/**
 * One-line structured security event (stdout). Never log secrets or raw email.
 * @param {{ type: string, userId?: string|null, emailHash?: string|null, ip?: string|null, errorCode?: string|null, at?: string }} event
 */
function logSecurityEvent(event) {
  if (!event || typeof event !== 'object') return;
  const type = String(event.type || '').trim();
  if (!type) return;

  const payload = {
    security_event: true,
    type,
    at: event.at || new Date().toISOString(),
  };

  if (event.userId != null && String(event.userId).trim()) {
    payload.userId = String(event.userId).trim();
  }
  if (event.emailHash != null && String(event.emailHash).trim()) {
    payload.emailHash = String(event.emailHash).trim();
  }
  if (event.ip != null && String(event.ip).trim()) {
    payload.ip = String(event.ip).trim().slice(0, 64);
  }
  if (event.errorCode != null && String(event.errorCode).trim()) {
    payload.errorCode = String(event.errorCode).trim().slice(0, 64);
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      delete payload[key];
    }
  }

  try {
    console.log(JSON.stringify(payload));
  } catch {
    // non-blocking
  }
}

/** SHA-256 hex of normalized email — never store plaintext email on fail paths. */
function hashEmailForLoginEvent(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Assert helper for unit tests: payload must not contain secrets or raw email.
 * @param {object} payload
 * @param {{ password?: string, token?: string, email?: string }} probes
 */
function assertSecurityPayloadSafe(payload, probes = {}) {
  const raw = JSON.stringify(payload);
  if (probes.password && raw.includes(probes.password)) {
    throw new Error('security payload leaked password');
  }
  if (probes.token && raw.includes(probes.token)) {
    throw new Error('security payload leaked token');
  }
  if (probes.email && raw.includes(probes.email)) {
    throw new Error('security payload leaked email');
  }
  return true;
}

module.exports = {
  logSecurityEvent,
  hashEmailForLoginEvent,
  assertSecurityPayloadSafe,
  FORBIDDEN_KEYS,
};
