const path = require('path');

/** Trong Docker `/shared` mount tách khỏi `/app` — require('cors') từ file này không thấy `/app/node_modules`. */
function loadCors() {
  try {
    return require('cors');
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    const tryPaths = [
      path.join(process.cwd(), 'node_modules', 'cors'),
      path.join('/app', 'node_modules', 'cors'),
    ];
    for (const p of tryPaths) {
      try {
        return require(p);
      } catch (_) {
        /* continue */
      }
    }
    throw err;
  }
}

const cors = loadCors();

/**
 * CORS đồng bộ với api-gateway: dev phản hồi linh hoạt; production chỉ whitelist CORS_ORIGIN.
 */
function createCorsMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000';
  const allowList = raw
    .split(',')
    .map((o) => o.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
    .filter(Boolean);

  return cors({
    origin: isProd ? allowList : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}

module.exports = { createCorsMiddleware };
