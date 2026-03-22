const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set UTF-8 charset cho tất cả JSON responses
app.set('json spaces', 2);
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

// Notification routes
const notificationRoutes = require('./routes/notification.routes');
app.use('/api/notifications', notificationRoutes);

module.exports = app;

