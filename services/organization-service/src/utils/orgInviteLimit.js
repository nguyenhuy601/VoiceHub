const crypto = require('crypto');
const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const ORG_RATE_LIMITED = 'ORG_RATE_LIMITED';
const LIMITER_UNAVAILABLE = 'LIMITER_UNAVAILABLE';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';
const UNAVAILABLE_MESSAGE = 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bucketConfig(bucket) {
  if (bucket === 'invite') {
    return {
      keyPrefix: 'org:invite:',
      limit: readPositiveInt(process.env.ORG_INVITE_RATE_LIMIT, 20),
      windowSec: readPositiveInt(process.env.ORG_INVITE_WINDOW_SEC, 600),
    };
  }
  if (bucket === 'join') {
    return {
      keyPrefix: 'org:join:',
      limit: readPositiveInt(process.env.ORG_JOIN_RATE_LIMIT, 20),
      windowSec: readPositiveInt(process.env.ORG_JOIN_WINDOW_SEC, 600),
    };
  }
  throw new Error('Invalid organization invite rate bucket');
}

function acceptLimits() {
  return {
    ipLimit: readPositiveInt(process.env.ORG_ACCEPT_IP_LIMIT, 20),
    tokenLimit: readPositiveInt(process.env.ORG_ACCEPT_TOKEN_LIMIT, 8),
    windowSec: readPositiveInt(process.env.ORG_ACCEPT_WINDOW_SEC, 600),
  };
}

function hashAcceptToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken).trim()).digest('hex');
}

function createOrgRateLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = ORG_RATE_LIMITED;
  return err;
}

function createLimiterUnavailableError() {
  const err = new Error(UNAVAILABLE_MESSAGE);
  err.statusCode = 503;
  err.errorCode = LIMITER_UNAVAILABLE;
  return err;
}

function throwIfDenied(rl, { denyWhenFailOpen }) {
  if (rl?.failOpen === true) {
    if (denyWhenFailOpen) throw createLimiterUnavailableError();
    return;
  }
  if (rl && rl.allowed === false) throw createOrgRateLimitError();
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false. Chỉ 503 khi denyWhenFailOpen.
 * @param {{ userId?: string, bucket: 'invite'|'join', denyWhenFailOpen?: boolean, checkRateLimit?: Function }} opts
 */
async function assertOrgInviteAllowed({
  userId,
  bucket,
  denyWhenFailOpen = false,
  checkRateLimit: check = checkRateLimit,
}) {
  const cfg = bucketConfig(bucket);
  const id = userId == null ? '' : String(userId);
  const rl = await check({
    key: `${cfg.keyPrefix}${id}`,
    limit: cfg.limit,
    windowSec: cfg.windowSec,
  });
  try {
    throwIfDenied(rl, { denyWhenFailOpen });
  } catch (err) {
    if (err.errorCode === ORG_RATE_LIMITED) err.bucket = bucket;
    throw err;
  }
}

/**
 * Token không phải chuỗi: 400, không đếm. Sau đó trần IP rồi trần hash.
 * @param {{ ip?: string, rawToken: unknown, checkRateLimit?: Function }} opts
 */
async function assertPublicAcceptAllowed({ ip, rawToken, checkRateLimit: check = checkRateLimit }) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    const err = new Error('token is required');
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_REQUIRED';
    throw err;
  }

  const cfg = acceptLimits();
  const ipPart = String(ip || '').trim() || 'unknown';
  const ipKey = `org:accept:ip:${ipPart}`;
  const tokenKey = `org:accept:token:${hashAcceptToken(rawToken)}`;

  const ipRl = await check({
    key: ipKey,
    limit: cfg.ipLimit,
    windowSec: cfg.windowSec,
  });
  throwIfDenied(ipRl, { denyWhenFailOpen: true });

  const tokenRl = await check({
    key: tokenKey,
    limit: cfg.tokenLimit,
    windowSec: cfg.windowSec,
  });
  throwIfDenied(tokenRl, { denyWhenFailOpen: true });
}

module.exports = {
  ORG_RATE_LIMITED,
  LIMITER_UNAVAILABLE,
  assertOrgInviteAllowed,
  assertPublicAcceptAllowed,
  createOrgRateLimitError,
  hashAcceptToken,
};
