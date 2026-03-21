require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { socketAuth } = require('/shared/middleware/auth');
const registerChatNamespace = require('./socket/chat.namespace');

const app = express();

app.use(cors());
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'socket-service' });
});

const PORT = process.env.PORT || 3017;
const corsOrigin = process.env.CORS_ORIGIN || '*';
const parsedOrigins = corsOrigin
  .split(',')
  .map((origin) => origin.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: parsedOrigins.length === 1 ? parsedOrigins[0] : parsedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Namespace chính cho chat (bạn bè + doanh nghiệp sau này)
const chatNamespace = io.of('/chat');
// Auth phải gắn trực tiếp vào namespace đang dùng.
chatNamespace.use(socketAuth);
registerChatNamespace(chatNamespace);

server.listen(PORT, () => {
  console.log(`Socket Service đang chạy trên cổng ${PORT}`);
  console.log(`[socket-service] Allowed origins: ${parsedOrigins.join(', ') || '*'}`);
});

