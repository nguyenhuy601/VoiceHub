require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { socketAuth } = require('/shared/middleware/auth');
const registerChatNamespace = require('./socket/chat.namespace');
const { setChatNamespace, publishRealtimeEvent } = require('./socket/realtimeHub');

const app = express();
app.use(express.json({ limit: '1mb' }));

const INTERNAL_REALTIME_TOKEN = process.env.REALTIME_INTERNAL_TOKEN || '';

const isProd = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN || (isProd ? '' : 'http://localhost:5173,http://localhost:3000');
const parsedOrigins = corsOrigin
  .split(',')
  .map((origin) => origin.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);

const socketCorsOrigin =
  parsedOrigins.length === 0 ? (isProd ? false : true) : parsedOrigins.length === 1 ? parsedOrigins[0] : parsedOrigins;

app.use(
  cors({
    origin: socketCorsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'socket-service' });
});

app.post('/internal/realtime/publish', (req, res) => {
  const token = req.headers['x-realtime-token'];
  if (INTERNAL_REALTIME_TOKEN && token !== INTERNAL_REALTIME_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized realtime publish' });
  }

  const result = publishRealtimeEvent(req.body || {});
  if (!result.ok) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

const PORT = process.env.PORT || 3017;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Namespace chính cho chat (bạn bè + doanh nghiệp sau này)
const chatNamespace = io.of('/chat');
// Auth phải gắn trực tiếp vào namespace đang dùng.
chatNamespace.use(socketAuth);
setChatNamespace(chatNamespace);
registerChatNamespace(chatNamespace);

server.listen(PORT, () => {
  const originLabel =
    socketCorsOrigin === true ? '*' : Array.isArray(socketCorsOrigin) ? socketCorsOrigin.join(', ') : String(socketCorsOrigin);
  console.log(`Socket Service đang chạy trên cổng ${PORT}`);
  console.log(`[socket-service] Allowed origins: ${originLabel}`);
  const presenceToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  console.log(
    `[socket-service] Presence → user-service: USER_SERVICE_URL=${process.env.USER_SERVICE_URL || 'http://user-service:3004'} ` +
      `internal token ${presenceToken ? 'SET (len=' + presenceToken.length + ')' : 'MISSING (disconnect sẽ KHÔNG cập nhật offline trong DB)'}`
  );
});

