const { JWT_REFRESH_EXPIRES_IN } = require('../config/jwt');

const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseJwtDurationToMs(value, fallbackMs) {
  const s = String(value || '').trim();
  const m = /^(\d+)(ms|s|m|h|d)$/i.exec(s);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!UNIT_MS[unit] || !Number.isFinite(n)) return fallbackMs;
  return n * UNIT_MS[unit];
}

function getRefreshTokenTtlMs() {
  return parseJwtDurationToMs(JWT_REFRESH_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000);
}

function refreshTokenExpiresAtFromNow() {
  return new Date(Date.now() + getRefreshTokenTtlMs());
}

function refreshTokenRedisTtlSeconds() {
  return Math.max(1, Math.ceil(getRefreshTokenTtlMs() / 1000));
}

module.exports = {
  parseJwtDurationToMs,
  getRefreshTokenTtlMs,
  refreshTokenExpiresAtFromNow,
  refreshTokenRedisTtlSeconds,
};
