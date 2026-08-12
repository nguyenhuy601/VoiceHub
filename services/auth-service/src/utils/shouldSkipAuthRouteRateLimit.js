/**
 * S2S `/api/auth/internal/*` đã bảo vệ bằng internalGatewayAuth —
 * không đếm vào IP rate-limit (tránh Excel import / provision burst → 429).
 *
 * @param {{ path?: string, originalUrl?: string, url?: string }} req
 * @returns {boolean}
 */
function shouldSkipAuthRouteRateLimit(req) {
  const path = String(req?.path || '');
  const original = String(req?.originalUrl || req?.url || '');
  return path.startsWith('/internal') || /\/api\/auth\/internal(?:\/|$|\?)/.test(original);
}

module.exports = {
  shouldSkipAuthRouteRateLimit,
};
