/**
 * CORS đồng bộ với api-gateway: dev phản hồi linh hoạt; production chỉ whitelist CORS_ORIGIN.
 * Không dùng package `cors` — file nằm trong /shared nên require('cors') resolve từ /shared/node_modules,
 * không từ /app/node_modules của từng service (gây MODULE_NOT_FOUND trong Docker).
 */
function createCorsMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000';
  const allowList = raw
    .split(',')
    .map((o) => o.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
    .filter(Boolean);

  return function corsMiddleware(req, res, next) {
    const requestOrigin = req.headers.origin;

    if (!isProd) {
      if (requestOrigin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (requestOrigin && allowList.includes(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    const reqHeaders = req.headers['access-control-request-headers'];
    res.setHeader(
      'Access-Control-Allow-Headers',
      reqHeaders || 'Content-Type, Authorization, X-Requested-With, x-internal-token, x-gateway-internal-token, x-user-id, x-user-email'
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
}

module.exports = { createCorsMiddleware };
