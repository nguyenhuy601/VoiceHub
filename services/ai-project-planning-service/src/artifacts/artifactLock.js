/**
 * Single-flight lock for one artifact hash.
 * Value is a random token. Release and renew run Lua that compares the token.
 */

const crypto = require('crypto');
const { runOnArtifactRedis } = require('./artifactRedis');

const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_RENEW_MS = 30_000;

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const RENEW_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

function lockKey(jobType, inputHash) {
  const job = String(jobType || 'how').replace(/[^a-z0-9_-]/gi, '') || 'how';
  const hash = String(inputHash || '').replace(/[^a-f0-9]/gi, '');
  return `vh:ai-plan:artifact-lock:${job}:${hash}`;
}

function resolveLeaseMs(opts = {}) {
  const n = Number(opts.leaseMs);
  if (Number.isFinite(n) && n >= 1000) return Math.round(n);
  return DEFAULT_LEASE_MS;
}

async function claimArtifactLock(jobType, inputHash, opts = {}) {
  const key = lockKey(jobType, inputHash);
  const token = crypto.randomBytes(16).toString('hex');
  const leaseMs = resolveLeaseMs(opts);
  const result = await runOnArtifactRedis(opts.env, opts.redis, async (redis) => {
    const set = await redis.set(key, token, 'PX', leaseMs, 'NX');
    if (set !== 'OK') return { ok: true, claimed: false, key };
    return { ok: true, claimed: true, token, key, leaseMs };
  });
  if (!result || result.ok === false) {
    return { ok: false, claimed: false, reason: result?.reason || 'redis_error', key };
  }
  return result;
}

async function renewArtifactLock(jobType, inputHash, token, opts = {}) {
  const key = lockKey(jobType, inputHash);
  const leaseMs = resolveLeaseMs(opts);
  const result = await runOnArtifactRedis(opts.env, opts.redis, async (redis) => {
    const n = await redis.eval(RENEW_LUA, 1, key, token, String(leaseMs));
    return { ok: true, renewed: Number(n) === 1 };
  });
  if (!result || result.ok === false) return { ok: false, renewed: false };
  return result;
}

async function releaseArtifactLock(jobType, inputHash, token, opts = {}) {
  const key = lockKey(jobType, inputHash);
  const result = await runOnArtifactRedis(opts.env, opts.redis, async (redis) => {
    const n = await redis.eval(RELEASE_LUA, 1, key, token);
    return { ok: true, released: Number(n) === 1 };
  });
  if (!result || result.ok === false) return { ok: false, released: false };
  return result;
}

module.exports = {
  DEFAULT_LEASE_MS,
  DEFAULT_RENEW_MS,
  RELEASE_LUA,
  RENEW_LUA,
  lockKey,
  claimArtifactLock,
  renewArtifactLock,
  releaseArtifactLock,
};
