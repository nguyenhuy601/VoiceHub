const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
require('dotenv').config();

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chat-service' });
});

// Message routes
const messageRoutes = require('./routes/message.routes');
app.use('/api/messages', messageRoutes);
app.use('/api/chat/messages', messageRoutes);

// 404
app.use((req, res) => {
  const { sendServiceError } = require('./middleware/sendServiceError');
  sendServiceError(res, 404, {
    errorCode: 'MESSAGE_NOT_FOUND',
    messageUser: 'Không tìm thấy tài nguyên.',
    message: 'Not found',
  });
});

const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;

