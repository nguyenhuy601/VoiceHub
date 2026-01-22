const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'task-service' });
});

// Task routes
const taskRoutes = require('./routes/task.routes');
app.use('/api/tasks', taskRoutes);
app.use('/api/work', taskRoutes); // Alias

module.exports = app;

