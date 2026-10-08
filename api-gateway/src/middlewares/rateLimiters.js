const rateLimit = require('express-rate-limit');

const SEARCH_PATHS = new Set(['/api/users/search', '/api/messages/search']);

/**
 * Key rate-limit: IP (đã qua stripSpoofedForwardHeaders / trust proxy) + userId khi JWT đã verify.
 * Limiter mount trước auth chỉ có IP.
 */
function rateLimitKey(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
  const userId = req.user?.id;
  return userId ? `${ip}:${userId}` : ip;
}

function isSearchRequest(req) {
  return req.method === 'GET' && SEARCH_PATHS.has(req.path);
}

/** Mount sau authMiddleware để key gồm userId. */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_SEARCH_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  skip: (req) => !isSearchRequest(req),
  message: { success: false, message: 'Too many search requests, please try again later' },
});

module.exports = {
  SEARCH_PATHS,
  rateLimitKey,
  isSearchRequest,
  searchLimiter,
};
