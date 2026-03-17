const axios = require('axios');

// URL nội bộ tới chat-service trong docker-compose
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://chat-service:3006';

module.exports = function registerChatNamespace(io) {
  io.on('connection', (socket) => {
    const userId = socket.user?.id || socket.user?._id;
    console.log('[socket-service] user connected:', userId);

    // Join room theo userId để hỗ trợ DM
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // ====== FRIEND DM: gửi tin nhắn ======
    socket.on('friend:send', async ({ receiverId, content, messageType = 'text' }) => {
      try {
        if (!receiverId || !content) {
          return socket.emit('error', { message: 'receiverId and content are required' });
        }

        // Lấy token từ auth handshake để forward sang chat-service
        const token = socket.handshake.auth?.token;

        const resp = await axios.post(
          `${CHAT_SERVICE_URL}/api/messages`,
          { receiverId, content, messageType },
          token
            ? { headers: { Authorization: `Bearer ${token}` } }
            : undefined
        );

        const payload = resp?.data || resp;
        const message = payload?.data || payload;

        // Broadcast cho người nhận + echo lại cho người gửi
        io.to(`user:${receiverId}`).emit('friend:new_message', message);
        socket.emit('friend:sent', message);
      } catch (err) {
        console.error('[socket-service] friend:send error', err.message);
        socket.emit('error', {
          message: err.response?.data?.message || err.message || 'Gửi tin nhắn thất bại'
        });
      }
    });

    // ====== FUTURE: ORG CHAT / ROOM CHAT ======
    // Có thể thêm:
    // - room:join
    // - room:leave
    // - room:send
    // và forward sang chat-service tương tự friend:send

    socket.on('disconnect', (reason) => {
      console.log('[socket-service] user disconnected:', userId, 'reason:', reason);
    });
  });
};

