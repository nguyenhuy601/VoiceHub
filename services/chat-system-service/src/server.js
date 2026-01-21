const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createClient } = require('redis');
require('dotenv').config();

const channelRoutes = require('./routes/channelRoutes');
const messageRoutes = require('./routes/messageRoutes');
const socketHandler = require('./socket/socketHandler');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  },
});

const PORT = process.env.PORT || 3006;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-chat-messages')
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err));

// Redis for pub/sub
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});
redisClient.connect().catch(console.error);

app.get('/health', (req, res) => {
  res.json({ service: 'chat-system-service', status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/chat/channels', channelRoutes);
app.use('/api/chat/messages', messageRoutes);
app.use(errorHandler);

// Socket.IO
socketHandler(io, redisClient);

server.listen(PORT, () => {
  console.log(`💬 Chat System Service running on port ${PORT}`);
});

module.exports = app;
