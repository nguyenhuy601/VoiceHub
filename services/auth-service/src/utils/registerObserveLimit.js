const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';
const UNAVAILABLE_MESSAGE = 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function registerObserveConfig() {
  return {
    key: 'auth:register:observe',
    limit: readPositiveInt(process.env.ORG_REGISTER_OBSERVE_LIMIT, 300),
    windowSec: 60,
  };
}

/**
 * failOpen → 503 trước khi tạo user. Đếm được và quá 300/phút → 429.
 * @param {{ allowed?: boolean, failOpen?: boolean } | null | undefined} rl
 * @returns {Error | null}
 */
function registerLimiterError(rl) {
  if (rl?.failOpen === true) {
    const err = new Error(UNAVAILABLE_MESSAGE);
    err.statusCode = 503;
    err.errorCode = 'LIMITER_UNAVAILABLE';
    return err;
  }
  if (rl && rl.allowed === false) {
    const err = new Error(LIMIT_MESSAGE);
    err.statusCode = 429;
    err.errorCode = 'AUTH_RATE_LIMITED';
    return err;
  }
  return null;
}

async function assertRegisterObserveAllowed({ checkRateLimit: check = checkRateLimit } = {}) {
  const rl = await check(registerObserveConfig());
  const err = registerLimiterError(rl);
  if (err) throw err;
}

module.exports = {
  assertRegisterObserveAllowed,
  registerLimiterError,
  registerObserveConfig,
};
