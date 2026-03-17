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

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

// Xác thực socket bằng JWT dùng middleware dùng chung
io.use(socketAuth);

// Namespace chính cho chat (bạn bè + doanh nghiệp sau này)
registerChatNamespace(io.of('/chat'));

server.listen(PORT, () => {
  console.log(`Socket Service đang chạy trên cổng ${PORT}`);
});

