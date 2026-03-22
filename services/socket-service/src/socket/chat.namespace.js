const axios = require('axios');
const { emitToRoom, emitToUser } = require('./realtimeHub');

// URL nội bộ tới chat-service trong docker-compose
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://chat-service:3006';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';
const USER_SERVICE_INTERNAL_TOKEN = process.env.USER_SERVICE_INTERNAL_TOKEN || '';

const onlineUserSockets = new Map();

/**
 * Đồng bộ presence lên user-service (online / offline).
 * Cần USER_SERVICE_INTERNAL_TOKEN trùng với user-service.
 */
async function syncPresenceUserStatus(userId, status) {
  if (!USER_SERVICE_INTERNAL_TOKEN || !userId) return;
  try {
    await axios.patch(
      `${USER_SERVICE_URL}/api/users/internal/status`,
      { userId: String(userId), status },
      {
        headers: { 'x-internal-token': USER_SERVICE_INTERNAL_TOKEN },
        timeout: 8000,
      }
    );
  } catch (err) {
    console.error(
      `[socket-service] syncPresenceUserStatus ${status} failed for ${userId}:`,
      err.response?.data?.message || err.message
    );
  }
}

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

module.exports = function registerChatNamespace(io) {
  io.on('connection', (socket) => {
    const authUser = socket.data?.user || socket.user || {};
    const userId = authUser.id || authUser.userId || authUser._id;
    console.log('[socket-service] user connected:', userId);

    // Join room theo userId để hỗ trợ DM
    if (userId) {
      const key = String(userId);
      socket.join(`user:${key}`);
      const prevCount = onlineUserSockets.get(key) || 0;
      onlineUserSockets.set(key, prevCount + 1);
      io.emit('user:connected', key);
      io.emit('users:online', Array.from(onlineUserSockets.keys()));
      // Kết nối socket đầu tiên → online trong DB
      if (prevCount === 0) {
        syncPresenceUserStatus(key, 'online');
      }
    }

    // ====== FRIEND DM: gửi tin nhắn ======
    socket.on('friend:send', async ({ receiverId, content, messageType = 'text' }) => {
      try {
        if (!receiverId || !content) {
          return socket.emit('error', { message: 'receiverId and content are required' });
        }

        // Lấy token từ auth handshake để forward sang chat-service
        const token = normalizeToken(
          socket.handshake.auth?.token || socket.handshake.headers?.authorization
        );

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
        emitToUser(receiverId, 'friend:new_message', message);
        socket.emit('friend:sent', message);
      } catch (err) {
        console.error('[socket-service] friend:send error', err.message);
        socket.emit('error', {
          message: err.response?.data?.message || err.message || 'Gửi tin nhắn thất bại'
        });
      }
    });

    socket.on('room:join', ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.emit('room:joined', { roomId });
    });

    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      socket.emit('room:left', { roomId });
    });

    socket.on('room:send', ({ roomId, event = 'room:new_message', payload = {} }) => {
      if (!roomId) return;
      emitToRoom(roomId, event, {
        ...payload,
        senderId: userId || null,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      if (userId) {
        const key = String(userId);
        const current = onlineUserSockets.get(key) || 0;
        if (current <= 1) {
          onlineUserSockets.delete(key);
          io.emit('user:disconnected', key);
          // Hết socket (đóng app / mất mạng) → offline trong DB
          syncPresenceUserStatus(key, 'offline');
        } else {
          onlineUserSockets.set(key, current - 1);
        }
        io.emit('users:online', Array.from(onlineUserSockets.keys()));
      }
      console.log('[socket-service] user disconnected:', userId, 'reason:', reason);
    });
  });
};

