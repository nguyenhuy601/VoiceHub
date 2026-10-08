const express = require('express');
const { createCorsMiddleware } = require('@enterprise/shared/middleware/corsPolicy');
const { authenticate } = require('@enterprise/shared/middleware/auth');
const { MAX_UPLOAD_BYTES } = require('./config/fileRetention');
const messageController = require('./controllers/message.controller');
const { messageWriteLimiter } = require('./middleware/userWriteRateLimit');
require('dotenv').config();

const app = express();
app.disable('x-powered-by');

// Middleware
app.use(createCorsMiddleware());

// Binary upload — đăng ký trước express.json để body không bị nuốt
const rawUploadParser = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
const uploadStorageHandlers = [
  authenticate,
  messageWriteLimiter,
  rawUploadParser,
  messageController.uploadStorageObject.bind(messageController),
];
app.post('/api/messages/storage/upload', ...uploadStorageHandlers);

const downloadStorageHandlers = [
  authenticate,
  messageController.downloadStorageObject.bind(messageController),
];
app.get('/api/messages/storage/object', ...downloadStorageHandlers);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chat-service' });
});

// Message routes
const messageRoutes = require('./routes/message.routes');
app.use('/api/messages', messageRoutes);

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

