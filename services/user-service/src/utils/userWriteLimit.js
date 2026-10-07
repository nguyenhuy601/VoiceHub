const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const USER_RATE_LIMITED = 'USER_RATE_LIMITED';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bucketConfig(bucket) {
  if (bucket === 'profileWrite') {
    return {
      keyPrefix: 'user:profileWrite:',
      limit: readPositiveInt(process.env.USER_PROFILE_WRITE_RATE_LIMIT, 20),
      windowSec: readPositiveInt(process.env.USER_PROFILE_WRITE_WINDOW_SEC, 600),
    };
  }
  if (bucket === 'lookup') {
    return {
      keyPrefix: 'user:lookup:',
      limit: readPositiveInt(process.env.USER_LOOKUP_RATE_LIMIT, 10),
      windowSec: readPositiveInt(process.env.USER_LOOKUP_WINDOW_SEC, 600),
    };
  }
  throw new Error('Invalid user rate bucket');
}

function createUserRateLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = USER_RATE_LIMITED;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false (D4). Không tự bịa 429.
 * @param {{ userId?: string, bucket: 'profileWrite'|'lookup', checkRateLimit?: Function }} opts
 */
async function assertUserActionAllowed({ userId, bucket, checkRateLimit: check = checkRateLimit }) {
  const cfg = bucketConfig(bucket);
  const id = userId == null ? '' : String(userId);
  const rl = await check({
    key: `${cfg.keyPrefix}${id}`,
    limit: cfg.limit,
    windowSec: cfg.windowSec,
  });
  if (!rl || rl.allowed !== false) return;
  const err = createUserRateLimitError();
  err.bucket = bucket;
  throw err;
}

module.exports = {
  USER_RATE_LIMITED,
  assertUserActionAllowed,
  createUserRateLimitError,
};
