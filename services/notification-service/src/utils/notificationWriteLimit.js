const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const NOTIFICATION_RATE_LIMITED = 'NOTIFICATION_RATE_LIMITED';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bucketConfig(bucket) {
  if (bucket === 'item') {
    return {
      keyPrefix: 'notif:item:',
      limit: readPositiveInt(process.env.NOTIFICATION_ITEM_RATE_LIMIT, 60),
      windowSec: readPositiveInt(process.env.NOTIFICATION_ITEM_WINDOW_SEC, 600),
    };
  }
  if (bucket === 'bulk') {
    return {
      keyPrefix: 'notif:bulk:',
      limit: readPositiveInt(process.env.NOTIFICATION_BULK_RATE_LIMIT, 10),
      windowSec: readPositiveInt(process.env.NOTIFICATION_BULK_WINDOW_SEC, 600),
    };
  }
  throw new Error('Invalid notification rate bucket');
}

function createNotificationRateLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = NOTIFICATION_RATE_LIMITED;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false (D4). Không tự bịa 429.
 * @param {{ userId?: string, bucket: 'item'|'bulk', checkRateLimit?: Function }} opts
 */
async function assertNotificationWriteAllowed({ userId, bucket, checkRateLimit: check = checkRateLimit }) {
  const cfg = bucketConfig(bucket);
  const id = userId == null ? '' : String(userId);
  const rl = await check({
    key: `${cfg.keyPrefix}${id}`,
    limit: cfg.limit,
    windowSec: cfg.windowSec,
  });
  if (!rl || rl.allowed !== false) return;
  const err = createNotificationRateLimitError();
  err.bucket = bucket;
  throw err;
}

module.exports = {
  NOTIFICATION_RATE_LIMITED,
  assertNotificationWriteAllowed,
  createNotificationRateLimitError,
};
