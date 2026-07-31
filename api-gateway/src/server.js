require('dotenv').config();

const { buildApiErrorBody } = require('@enterprise/shared/middleware/httpErrorResponse');

if (process.env.NODE_ENV === 'production') {
  const jwt = String(process.env.JWT_SECRET || '').trim();
  if (!jwt || jwt === 'your-secret-key' || jwt === 'your-secret-key-change-in-production') {
    console.error('[API-Gateway] FATAL: set JWT_SECRET to a strong non-default value in production.');
    process.exit(1);
  }
  if (!String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim()) {
    console.error('[API-Gateway] FATAL: GATEWAY_INTERNAL_TOKEN is required in production.');
    process.exit(1);
  }
}

const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = require('./app');
const { services } = require('./config/services');
const { connectBffRedis } = require('./bff/cache');

connectBffRedis();

/** Production: chạy sau reverse proxy TLS (HTTPS/Nginx) — đặt TRUST_PROXY=1 trong api-gateway/.env để rate-limit đếm đúng client IP. */
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const PORT = process.env.PORT || 3000;
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

const server = http.createServer(app);
server.headersTimeout = Number(process.env.GATEWAY_HEADERS_TIMEOUT_MS || 15000);
// >= BFF documents-overview (45s) + buffer; tránh đóng client trước khi aggregate xong.
server.requestTimeout = Number(process.env.GATEWAY_REQUEST_TIMEOUT_MS || 60000);
server.keepAliveTimeout = Number(process.env.GATEWAY_KEEPALIVE_TIMEOUT_MS || 5000);

/** WS upgrade — không dùng timeout HTTP ngắn của API proxy. 0 = không cắt sớm. */
const SOCKET_PROXY_TIMEOUT_MS = Number(process.env.GATEWAY_SOCKET_PROXY_TIMEOUT_MS || 0);

const socketProxy = createProxyMiddleware({
  target: services.socket.url,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  logLevel: 'warn',
  timeout: SOCKET_PROXY_TIMEOUT_MS,
  proxyTimeout: SOCKET_PROXY_TIMEOUT_MS,
  onError: (err, req, res) => {
    console.error('[API-Gateway] Socket proxy error:', err);
    if (res && !res.headersSent) {
      const body = buildApiErrorBody(503, {
        errorCode: 'GATEWAY_SERVICE_UNAVAILABLE',
        message: 'Socket service unavailable',
        messageUser: 'Dịch vụ tạm thời không khả dụng.',
      });
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  },
});

const voiceSignalProxy = createProxyMiddleware({
  target: services.voice.url,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  logLevel: 'warn',
  timeout: SOCKET_PROXY_TIMEOUT_MS,
  proxyTimeout: SOCKET_PROXY_TIMEOUT_MS,
  onError: (err, req, res) => {
    console.error('[API-Gateway] Voice signal proxy error:', err);
    if (res && !res.headersSent) {
      const body = buildApiErrorBody(503, {
        errorCode: 'GATEWAY_SERVICE_UNAVAILABLE',
        message: 'Voice signaling service unavailable',
        messageUser: 'Dịch vụ tạm thời không khả dụng.',
      });
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  },
});

// Proxy WebSocket upgrades by path.
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith(VOICE_SIGNAL_PATH)) {
    return voiceSignalProxy.upgrade(req, socket, head);
  }
  return socketProxy.upgrade(req, socket, head);
});

server.listen(PORT, () => {
  console.log(`API Gateway đang chạy trên cổng ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (!String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim()) {
    console.warn(
      '[API-Gateway] GATEWAY_INTERNAL_TOKEN chưa đặt — các service downstream có thể từ chối x-user-id. Thêm vào .env (trùng với user-service, task-service, …).'
    );
  }
  console.log(`Socket proxy upstream: ${services.socket.url}`);
  console.log(`Voice signaling proxy upstream: ${services.voice.url}`);
  console.log(`Voice signaling path: ${VOICE_SIGNAL_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => process.exit(0));
});




