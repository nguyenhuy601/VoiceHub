const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const PROJECT_RATE_LIMITED = 'PROJECT_RATE_LIMITED';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function requestPath(req) {
  return String(req?.originalUrl || req?.url || req?.path || '');
}

function shouldLimitProjectWrite(req) {
  const method = String(req?.method || '').toUpperCase();
  if (!WRITE_METHODS.has(method)) return false;
  return !requestPath(req).includes('/internal/');
}

function resolveActorId({ userId, req }) {
  if (userId !== undefined && userId !== null) return String(userId).trim();
  return String(req?.user?.id || req?.user?.userId || req?.userContext?.userId || '').trim();
}

function createProjectWriteLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = PROJECT_RATE_LIMITED;
  err.messageUser = LIMIT_MESSAGE;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false. Không tự bịa 429.
 * userId rỗng: không gọi check — key `project:write:` không phải key rỗng và sẽ thành bộ đếm chung.
 * @param {{ userId?: string, req?: object, checkRateLimit?: Function }} opts
 */
async function assertProjectWriteAllowed({ userId, req, checkRateLimit: check = checkRateLimit } = {}) {
  const id = resolveActorId({ userId, req });
  if (!id) return;

  const rl = await check({
    key: `project:write:${id}`,
    limit: readPositiveInt(process.env.PROJECT_WRITE_RATE_LIMIT, 120),
    windowSec: readPositiveInt(process.env.PROJECT_WRITE_WINDOW_SEC, 60),
  });
  if (!rl || rl.allowed !== false) return;
  throw createProjectWriteLimitError();
}

module.exports = {
  PROJECT_RATE_LIMITED,
  LIMIT_MESSAGE,
  shouldLimitProjectWrite,
  assertProjectWriteAllowed,
  createProjectWriteLimitError,
};
