const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chat-service' });
});

// Message routes
const messageRoutes = require('./routes/message.routes');
app.use('/api/messages', messageRoutes);

module.exports = app;

