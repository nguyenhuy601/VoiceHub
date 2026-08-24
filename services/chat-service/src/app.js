const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const { MAX_UPLOAD_BYTES } = require('./config/fileRetention');
const messageController = require('./controllers/message.controller');
require('dotenv').config();

const app = express();

// Middleware
app.use(createCorsMiddleware());

// Binary upload — đăng ký trước express.json để body không bị nuốt
const rawUploadParser = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
const uploadStorageHandlers = [
  authenticate,
  rawUploadParser,
  messageController.uploadStorageObject.bind(messageController),
];
app.post('/api/messages/storage/upload', ...uploadStorageHandlers);
app.post('/api/chat/messages/storage/upload', ...uploadStorageHandlers);

const downloadStorageHandlers = [
  authenticate,
  messageController.downloadStorageObject.bind(messageController),
];
app.get('/api/messages/storage/object', ...downloadStorageHandlers);
app.get('/api/chat/messages/storage/object', ...downloadStorageHandlers);

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

