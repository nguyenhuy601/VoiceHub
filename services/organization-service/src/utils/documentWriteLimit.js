const { checkRateLimit } = require('@enterprise/shared/utils/redisRateLimit');

const DOCUMENT_RATE_LIMITED = 'DOCUMENT_RATE_LIMITED';
const LIMIT_MESSAGE = 'Quá nhiều thao tác. Vui lòng thử lại sau.';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function readPositiveInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createDocumentRateLimitError() {
  const err = new Error(LIMIT_MESSAGE);
  err.statusCode = 429;
  err.errorCode = DOCUMENT_RATE_LIMITED;
  return err;
}

/**
 * Redis vắng hoặc INCR lỗi: checkRateLimit trả allowed !== false (D4). Không tự bịa 429.
 * @param {{ userId?: string, bucket?: 'write', checkRateLimit?: Function }} opts
 */
async function assertDocumentWriteAllowed({ userId, bucket = 'write', checkRateLimit: check = checkRateLimit }) {
  if (bucket !== 'write') {
    throw new Error('Invalid document rate bucket');
  }
  const limit = readPositiveInt(process.env.DOCUMENT_WRITE_RATE_LIMIT, 20);
  const windowSec = readPositiveInt(process.env.DOCUMENT_WRITE_WINDOW_SEC, 600);
  const id = userId == null ? '' : String(userId);
  const rl = await check({
    key: `doc:write:${id}`,
    limit,
    windowSec,
  });
  if (!rl || rl.allowed !== false) return;
  const err = createDocumentRateLimitError();
  err.bucket = bucket;
  throw err;
}

function clampDocumentListQuery({ page, limit } = {}) {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  return {
    page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : DEFAULT_PAGE,
    limit: Number.isFinite(limitNum) && limitNum >= 1 ? Math.min(limitNum, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}

module.exports = {
  DOCUMENT_RATE_LIMITED,
  assertDocumentWriteAllowed,
  clampDocumentListQuery,
  createDocumentRateLimitError,
};
