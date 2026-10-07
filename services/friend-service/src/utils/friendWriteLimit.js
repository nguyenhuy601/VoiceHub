const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const FRIEND_RATE_LIMITED = 'FRIEND_RATE_LIMITED';

const REQUEST_LIMIT_MESSAGE = 'Quá nhiều lời mời kết bạn. Vui lòng thử lại sau.';
const MUTATE_LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bucketConfig(bucket) {
  if (bucket === 'search') {
    return {
      keyPrefix: 'friend:search:',
      limit: readPositiveInt(process.env.FRIEND_SEARCH_RATE_LIMIT, 10),
      windowSec: readPositiveInt(process.env.FRIEND_SEARCH_RATE_WINDOW_SEC, 600),
      message: MUTATE_LIMIT_MESSAGE,
    };
  }
  if (bucket === 'mutate') {
    return {
      keyPrefix: 'friend:mutate:',
      limit: readPositiveInt(process.env.FRIEND_MUTATE_RATE_LIMIT, 30),
      windowSec: readPositiveInt(process.env.FRIEND_MUTATE_RATE_WINDOW_SEC, 600),
      message: MUTATE_LIMIT_MESSAGE,
    };
  }
  if (bucket === 'request') {
    return {
      keyPrefix: 'friend:request:',
      limit: readPositiveInt(process.env.FRIEND_REQUEST_RATE_LIMIT, 20),
      windowSec: readPositiveInt(process.env.FRIEND_REQUEST_RATE_WINDOW_SEC, 600),
      message: REQUEST_LIMIT_MESSAGE,
    };
  }
  throw new Error('Invalid friend rate bucket');
}

function createFriendRateLimitError(message) {
  const err = new Error(message || MUTATE_LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = FRIEND_RATE_LIMITED;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed true (D4). Không đổi thành 429.
 * @param {{ userId?: string, bucket: 'search'|'mutate'|'request', checkRateLimit?: Function }} opts
 */
async function assertFriendWriteAllowed({ userId, bucket, checkRateLimit: check = checkRateLimit }) {
  const cfg = bucketConfig(bucket);
  const id = userId == null ? '' : String(userId);
  const rl = await check({
    key: `${cfg.keyPrefix}${id}`,
    limit: cfg.limit,
    windowSec: cfg.windowSec,
  });
  if (!rl || rl.allowed !== false) return;
  throw createFriendRateLimitError(cfg.message);
}

function clampFriendListQuery(page, limit) {
  const p = Number.parseInt(page, 10);
  const l = Number.parseInt(limit, 10);
  const safePage = Number.isFinite(p) && p >= 1 ? p : 1;
  const rawLimit = Number.isFinite(l) && l >= 1 ? l : 50;
  return { page: safePage, limit: Math.min(100, rawLimit) };
}

module.exports = {
  FRIEND_RATE_LIMITED,
  assertFriendWriteAllowed,
  clampFriendListQuery,
  createFriendRateLimitError,
};
