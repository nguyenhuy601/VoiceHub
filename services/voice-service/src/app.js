const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'voice-service' });
});

// Meeting routes
const meetingRoutes = require('./routes/meeting.routes');
app.use('/api/meetings', meetingRoutes);
app.use('/api/voice', meetingRoutes); // Alias

module.exports = app;

