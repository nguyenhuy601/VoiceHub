const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const friendRoutes = require('./routes/friendRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-chat-friends')
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err));

app.get('/health', (req, res) => {
  res.json({ service: 'friend-service', status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/friends', friendRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`👥 Friend Service running on port ${PORT}`);
});

module.exports = app;
