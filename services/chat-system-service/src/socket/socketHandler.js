const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

const socketHandler = (io, redisClient) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      socket.user = response.data.data.user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);

    // Join user's personal room
    socket.join(`user:${socket.user._id}`);

    // Broadcast online status
    socket.broadcast.emit('user:connected', socket.user._id);

    // Join channel
    socket.on('channel:join', ({ channelId }) => {
      socket.join(`channel:${channelId}`);
      console.log(`User ${socket.user.name} joined channel ${channelId}`);
    });

    // Leave channel
    socket.on('channel:leave', ({ channelId }) => {
      socket.leave(`channel:${channelId}`);
    });

    // Send message
    socket.on('message:send', async (data) => {
      const { channelId, content } = data;

      // Save to database
      const Message = require('../models/Message');
      const message = await Message.create({
        content,
        channel: channelId,
        sender: socket.user._id,
      });

      const populatedMessage = await Message.findById(message._id).populate('sender', 'name avatar');

      // Broadcast to channel
      io.to(`channel:${channelId}`).emit('message:new', populatedMessage);
    });

    // Typing indicator
    socket.on('typing:start', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('user:typing', {
        userId: socket.user._id,
        userName: socket.user.name,
        channelId,
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('user:stopped-typing', {
        userId: socket.user._id,
        channelId,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
      socket.broadcast.emit('user:disconnected', socket.user._id);
    });
  });
};

module.exports = socketHandler;
