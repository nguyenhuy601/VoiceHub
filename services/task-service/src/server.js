const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const taskRoutes = require('./routes/taskRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3009;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-chat-tasks')
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err));

app.get('/health', (req, res) => {
  res.json({ service: 'task-service', status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/tasks', taskRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`📋 Task Service running on port ${PORT}`);
});

module.exports = app;
