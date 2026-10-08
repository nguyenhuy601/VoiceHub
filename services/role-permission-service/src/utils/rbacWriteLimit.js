const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const ROLE_RATE_LIMITED = 'ROLE_RATE_LIMITED';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveActorId({ userId, req }) {
  if (userId !== undefined && userId !== null) return String(userId).trim();
  return String(req?.user?.id || req?.user?.userId || req?.userContext?.userId || '').trim();
}

function createRbacWriteLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = ROLE_RATE_LIMITED;
  err.messageUser = LIMIT_MESSAGE;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false. Không tự bịa 429.
 * userId rỗng: không gọi check — key `rbac:write:` không phải key rỗng và sẽ thành bộ đếm chung.
 * @param {{ userId?: string, req?: object, checkRateLimit?: Function }} opts
 */
async function assertRbacWriteAllowed({ userId, req, checkRateLimit: check = checkRateLimit } = {}) {
  const id = resolveActorId({ userId, req });
  if (!id) return;

  const rl = await check({
    key: `rbac:write:${id}`,
    limit: readPositiveInt(process.env.ROLE_WRITE_RATE_LIMIT, 40),
    windowSec: readPositiveInt(process.env.ROLE_WRITE_WINDOW_SEC, 600),
  });
  if (!rl || rl.allowed !== false) return;
  throw createRbacWriteLimitError();
}

module.exports = {
  ROLE_RATE_LIMITED,
  LIMIT_MESSAGE,
  assertRbacWriteAllowed,
  createRbacWriteLimitError,
};
