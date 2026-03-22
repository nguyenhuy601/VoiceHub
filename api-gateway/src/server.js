require('dotenv').config();
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = require('./app');
const { services } = require('./config/services');

/** Production: chạy sau reverse proxy TLS (HTTPS) — bật trust proxy nếu cần req.secure */
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

const PORT = process.env.PORT || 3000;
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

const server = http.createServer(app);

const socketProxy = createProxyMiddleware({
  target: services.socket.url,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  logLevel: 'warn',
  onError: (err, req, res) => {
    if (res && !res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          message: 'Socket service unavailable',
          error: err.message,
        })
      );
    }
  },
});

const voiceSignalProxy = createProxyMiddleware({
  target: services.voice.url,
  changeOrigin: true,
  ws: true,
  xfwd: true,
  logLevel: 'warn',
  onError: (err, req, res) => {
    if (res && !res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          message: 'Voice signaling service unavailable',
          error: err.message,
        })
      );
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
  console.log(`Socket proxy upstream: ${services.socket.url}`);
  console.log(`Voice signaling proxy upstream: ${services.voice.url}`);
  console.log(`Voice signaling path: ${VOICE_SIGNAL_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => process.exit(0));
});




