const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'friend-service' });
});

// Friend routes
const friendRoutes = require('./routes/friend.routes');
app.use('/api/friends', friendRoutes);

module.exports = app;

