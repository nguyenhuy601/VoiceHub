const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

// Notification routes
const notificationRoutes = require('./routes/notification.routes');
app.use('/api/notifications', notificationRoutes);

module.exports = app;

