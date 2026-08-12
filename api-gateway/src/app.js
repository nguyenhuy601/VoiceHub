const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { sendApiError, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');
const { services } = require('./config/services');
const { isSwaggerEnabled } = require('./swagger/isSwaggerEnabled');
const { mountSwagger } = require('./swagger/mountSwagger');
require('dotenv').config();

const app = express();
const swaggerOn = isSwaggerEnabled();

/** Liveness — đăng ký trước mọi middleware/proxy để không bị kẹt khi upstream chết. */
app.get('/api/health/gateway-trust', (req, res) => {
  const configured = Boolean(String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim());
  res.json({
    success: true,
    gatewayTrustConfigured: configured,
    message: configured
      ? 'Gateway trust đã cấu hình (GATEWAY_INTERNAL_TOKEN).'
      : 'API Gateway chưa đặt GATEWAY_INTERNAL_TOKEN — đăng nhập sẽ không ổn định. Thêm biến này vào api-gateway/.env và đồng bộ với các microservice.',
  });
});
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway is running',
    timestamp: new Date().toISOString(),
  });
});
app.get('/metrics', (req, res) => {
  res.json({
    success: true,
    service: 'api-gateway',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/** Timeout proxy REST API (không áp dụng Socket.IO long-polling). */
const PROXY_HTTP_TIMEOUT_MS = Number(process.env.GATEWAY_PROXY_TIMEOUT_MS || 60000);
/** Long-polling giữ request mở lâu — 0 = không cắt sớm (tránh reconnect loop). */
const SOCKET_PROXY_TIMEOUT_MS = Number(process.env.GATEWAY_SOCKET_PROXY_TIMEOUT_MS || 0);

// cross-origin: cần avatar/media; frameguard: chống clickjacking
// Swagger UI cần bỏ CSP chỉ trên /api/docs* (không tắt CSP toàn app)
function isSwaggerDocsPath(reqPath) {
  const p = String(reqPath || '').split('?')[0];
  return (
    p === '/api/docs' ||
    p === '/api/docs.json' ||
    p === '/api/docs.yaml' ||
    p.startsWith('/api/docs/') ||
    p.startsWith('/api/docs-assets')
  );
}

if (swaggerOn) {
  app.use((req, res, next) => {
    if (!isSwaggerDocsPath(req.path)) return next();
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      if (String(name).toLowerCase() === 'content-security-policy') return res;
      return setHeader(name, value);
    };
    next();
  });
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
  })
);

// OpenAPI / Swagger UI — gate bởi isSwaggerEnabled; trước auth/proxy
if (swaggerOn) {
  mountSwagger(app);
}

// Rate limit /api/* — không áp dụng /socket.io và voice signaling (WebRTC handshake).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (!req.path.startsWith('/api')) return true;
    // Docs không tính vào API rate limit
    if (req.path.startsWith('/api/docs')) return true;
    return false;
  },
});
app.use(apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_LOGIN_RATE_MAX || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later' },
});
app.use('/api/auth/login', loginLimiter);

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GATEWAY_REFRESH_RATE_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many refresh attempts, please try again later' },
});
app.use('/api/auth/refresh-token', refreshLimiter);
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

// Middleware — production: chỉ origin trong whitelist; dev: cho phép không có Origin (mobile/curl)
app.use(createCorsMiddleware());

// Proxy Socket.IO polling traffic before auth/permission middlewares.
app.use(
  '/socket.io',
  createProxyMiddleware({
    target: services.socket.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'warn',
    /**
     * Express mount `/socket.io` sẽ làm req.url trong middleware chỉ còn `/?EIO=...`
     * nhưng socket-service cần path `/socket.io`.
     */
    pathRewrite: (path) => `/socket.io${path}`,
    timeout: SOCKET_PROXY_TIMEOUT_MS,
    proxyTimeout: SOCKET_PROXY_TIMEOUT_MS,
    onError: (err, req, res) => {
      console.warn('[API-Gateway] Socket HTTP proxy error:', err?.message || err);
      if (res && !res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'Socket service unavailable',
        });
      }
    },
  })
);

// Proxy voice signaling polling (mediasoup signaling via Socket.IO)
app.use(
  VOICE_SIGNAL_PATH,
  createProxyMiddleware({
    target: services.voice.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'warn',
    /**
     * Tương tự `/socket.io`: khi mount theo `VOICE_SIGNAL_PATH`, req.url bị strip prefix.
     */
    pathRewrite: (path) => `${VOICE_SIGNAL_PATH}${path}`,
    timeout: SOCKET_PROXY_TIMEOUT_MS,
    proxyTimeout: SOCKET_PROXY_TIMEOUT_MS,
    onError: (err, req, res) => {
      console.warn('[API-Gateway] Voice signal HTTP proxy error:', err?.message || err);
      if (res && !res.headersSent) {
        res.status(503).json({
          success: false,
          message: 'Voice signaling service unavailable',
        });
      }
    },
  })
);

// Legacy /uploads/* — yêu cầu JWT; ưu tiên GET /api/users/:id/avatar
const authMiddleware = require('./middlewares/auth.middleware');
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_UPLOAD_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many upload requests, please try again later' },
});
app.use(
  '/uploads',
  uploadLimiter,
  authMiddleware,
  createProxyMiddleware({
    target: services.user.url,
    changeOrigin: true,
    xfwd: true,
    logLevel: 'warn',
    pathRewrite: (path) => `/uploads${path.startsWith('/') ? path : `/${path}`}`,
  })
);

// Routes
const routes = require('./routes');
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err && (err.message === 'CORS blocked' || String(err.message || '').includes('CORS'))) {
    return sendApiError(res, 403, {
      errorCode: 'CORS_FORBIDDEN',
      message: 'Not allowed by CORS',
      messageUser: 'Nguồn yêu cầu không được phép truy cập.',
    });
  }
  console.error('Error:', err);
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) {
    return sendApiError(res, status, {
      errorCode: 'GATEWAY_INTERNAL_ERROR',
      messageUser: GENERIC_5XX_MESSAGE,
    });
  }
  return sendApiError(res, status, {
    errorCode: err?.errorCode || 'GATEWAY_INTERNAL_ERROR',
    message: err?.message || 'Request failed',
    messageUser: err?.messageUser || err?.message || 'Request failed',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;
