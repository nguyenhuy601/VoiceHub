const axios = require('axios');
const { emitToRoom, emitToUser } = require('./realtimeHub');
const { publishFriendDm } = require('../messaging/rabbitPublisher');
const redisPresence = require('../presence/redisPresence');
const redisFriendChatFocus = require('../presence/redisFriendChatFocus');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!CHAT_SERVICE_URL) throw new Error('Thiếu biến môi trường: CHAT_SERVICE_URL');
const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');

function getPresenceInternalToken() {
  return String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
}

const onlineUserSockets = new Map();
const pendingOfflineTimers = new Map();
const OFFLINE_GRACE_MS = Math.max(0, Number(process.env.PRESENCE_OFFLINE_GRACE_MS || 12000));

const FRIEND_SEND_WINDOW_MS = Math.max(1000, Number(process.env.FRIEND_SEND_RATE_WINDOW_MS || 10000));
const FRIEND_SEND_MAX = Math.max(1, Number(process.env.FRIEND_SEND_RATE_MAX || 30));
const ROOM_SEND_WINDOW_MS = Math.max(1000, Number(process.env.ROOM_SEND_RATE_WINDOW_MS || 10000));
const ROOM_SEND_MAX = Math.max(1, Number(process.env.ROOM_SEND_RATE_MAX || 60));
const PRESENCE_SUB_WINDOW_MS = Math.max(1000, Number(process.env.PRESENCE_SUB_RATE_WINDOW_MS || 60000));
const PRESENCE_SUB_MAX = Math.max(1, Number(process.env.PRESENCE_SUB_RATE_MAX || 20));

const { isSocketEventRateLimited } = require('../utils/socketEventRateLimit');
const { validateFriendSendPayload } = require('../utils/socketEventValidation');

async function emitRateLimited(socket, userId, eventKey, limits) {
  const limited = await isSocketEventRateLimited(eventKey, userId, socket, limits);
  if (!limited) return false;
  socket.emit('error', {
    message: 'Thao tác quá nhanh, vui lòng thử lại sau',
    code: 'RATE_LIMITED',
  });
  return true;
}

function cancelPendingOffline(userKey) {
  const t = pendingOfflineTimers.get(userKey);
  if (t) {
    clearTimeout(t);
    pendingOfflineTimers.delete(userKey);
  }
}

/**
 * Đồng bộ presence lên user-service (online / offline).
 * Cần USER_SERVICE_INTERNAL_TOKEN trùng với user-service (docker-compose / .env).
 */
async function syncPresenceUserStatus(userId, status) {
  if (!userId) return false;
  const token = getPresenceInternalToken();
  if (!token) {
    console.warn(
      '[socket-service] syncPresenceUserStatus skipped: USER_SERVICE_INTERNAL_TOKEN is empty. ' +
        'Set the same token as user-service so disconnect → offline in DB works.'
    );
    return false;
  }
  try {
    const url = `${USER_SERVICE_URL.replace(/\/$/, '')}/api/users/internal/status`;
    const res = await axios.patch(
      url,
      { userId: String(userId), status },
      {
        headers: { 'x-internal-token': token },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 200 && res.status < 300) {
      console.log(`[socket-service] presence synced: user=${userId} status=${status}`);
      return true;
    }
    console.error(
      `[socket-service] syncPresenceUserStatus ${status} HTTP ${res.status} for ${userId}:`,
      res.data?.message || res.data
    );
    return false;
  } catch (err) {
    console.error(
      `[socket-service] syncPresenceUserStatus ${status} failed for ${userId}:`,
      err.response?.data?.message || err.message
    );
    return false;
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
      cancelPendingOffline(key);
      socket.join(`user:${key}`);
      const prevCount = onlineUserSockets.get(key) || 0;
      onlineUserSockets.set(key, prevCount + 1);
      io.emit('user:connected', key);
      io.emit('users:online', Array.from(onlineUserSockets.keys()));
      // Kết nối socket đầu tiên → online trong DB
      if (prevCount === 0) {
        redisPresence.setOnline(key);
        syncPresenceUserStatus(key, 'online');
        io.emit('presence:batch', { userId: key, status: 'online' });
      }
    }

    socket.on('presence:subscribe', async (payload = {}) => {
      try {
        if (await emitRateLimited(socket, userId, 'presence:subscribe', {
          limit: PRESENCE_SUB_MAX,
          windowMs: PRESENCE_SUB_WINDOW_MS,
        })) {
          return;
        }
        const ids = Array.isArray(payload.userIds)
          ? payload.userIds.map((id) => String(id).trim()).filter(Boolean)
          : [];
        const selfId = String(userId || '').trim();
        const limited = ids.slice(0, 30);
        const allowed = new Set([selfId]);
        if (FRIEND_SERVICE_URL && GATEWAY_INTERNAL_TOKEN && limited.length) {
          try {
            const fr = await axios.get(`${FRIEND_SERVICE_URL}/api/friends`, {
              headers: {
                'x-user-id': selfId,
                'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN,
              },
              timeout: 8000,
              validateStatus: () => true,
            });
            const body = fr.data?.data;
            const list = Array.isArray(body) ? body : body?.friends || [];
            for (const row of list) {
              const fid = String(row?.friendId || row?.userId || row?.id || row?._id || '').trim();
              if (fid) allowed.add(fid);
            }
          } catch {
            /* chỉ trả presence của chính user nếu không load được friend list */
          }
        }
        const allowedIds = limited.filter((id) => allowed.has(id));
        const users = await Promise.all(
          allowedIds.map(async (id) => {
            const inMemory = (onlineUserSockets.get(id) || 0) > 0;
            const redisOn = inMemory ? true : await redisPresence.isOnline(id);
            return { userId: id, status: inMemory || redisOn ? 'online' : 'offline' };
          })
        );
        socket.emit('presence:batch', { users, timestamp: new Date().toISOString() });
      } catch (err) {
        socket.emit('error', { message: 'Không thể theo dõi trạng thái hiện diện lúc này' });
      }
    });

    // ====== FRIEND DM: gửi tin nhắn ======
    socket.on('friend:send', async ({ receiverId, content, messageType = 'text', replyToMessageId }) => {
      try {
        if (!userId) {
          return socket.emit('error', { message: 'Unauthorized' });
        }
        if (
          await isSocketEventRateLimited('friend:send', userId, socket, {
            limit: FRIEND_SEND_MAX,
            windowMs: FRIEND_SEND_WINDOW_MS,
          })
        ) {
          return socket.emit('friend:send_failed', {
            message: 'Gửi tin quá nhanh, vui lòng thử lại sau',
            code: 'RATE_LIMITED',
          });
        }
        const validation = validateFriendSendPayload({
          receiverId,
          content,
          messageType,
          replyToMessageId,
        });
        if (!validation.ok) {
          return socket.emit('error', { message: validation.message });
        }

        let useQueue =
          process.env.FRIEND_DM_USE_QUEUE !== 'false' && Boolean(process.env.RABBITMQ_URL);
        if (replyToMessageId) {
          useQueue = false;
        }

        const token = normalizeToken(
          socket.handshake.auth?.token || socket.handshake.headers?.authorization
        );
        const authorization = token ? `Bearer ${token}` : null;

        if (useQueue && userId) {
          const pub = await publishFriendDm({
            senderId: userId,
            receiverId,
            content,
            messageType,
            replyToMessageId,
            authorization,
          });
          if (pub.ok) {
            redisPresence.refreshTtl(String(userId));
            return;
          }
          console.warn('[socket-service] friend:send queue publish failed, falling back to HTTP');
        }

        const body = { receiverId, content, messageType };
        if (replyToMessageId) body.replyToMessageId = replyToMessageId;

        const resp = await axios.post(`${CHAT_SERVICE_URL}/api/messages`, body, {
          headers: authorization ? { Authorization: authorization } : {},
          timeout: 15000,
          validateStatus: () => true,
        });
        if (resp.status >= 400) {
          const data = resp.data || {};
          return socket.emit('error', {
            message: data.message || 'Gửi tin nhắn thất bại',
            code: data.code,
            blockerId: data.blockerId,
          });
        }
        // chat-service đã emit friend:new_message / friend:sent qua emitRealtimeEvent
      } catch (err) {
        console.error('[socket-service] friend:send error', err.message);
        const data = err.response?.data || {};
        socket.emit('error', {
          message: data.message || err.message || 'Gửi tin nhắn thất bại',
          code: data.code,
          blockerId: data.blockerId,
        });
      }
    });

    socket.on('friend:typing_start', ({ receiverId }) => {
      if (!receiverId || !userId) return;
      emitToUser(receiverId, 'friend:typing_start', { senderId: String(userId) });
    });

    socket.on('friend:typing_stop', ({ receiverId }) => {
      if (!receiverId || !userId) return;
      emitToUser(receiverId, 'friend:typing_stop', { senderId: String(userId) });
    });

    socket.on('friend:chat_focus', async ({ active } = {}) => {
      if (!userId) return;
      const key = String(userId);
      if (active) {
        await redisFriendChatFocus.setActive(key);
      } else {
        await redisFriendChatFocus.clear(key);
      }
    });

    socket.on('room:join', async ({ roomId, organizationId } = {}) => {
      if (!roomId) return;
      const orgId = String(organizationId || '').trim();
      if (!orgId) {
        socket.emit('room:error', { roomId, message: 'organizationId is required' });
        return;
      }
      const { assertOrgChannelSocketAccess } = require('../utils/orgRoomAccess');
      const authHeader = socket.handshake?.headers?.authorization;
      const access = await assertOrgChannelSocketAccess({
        userId: String(userId),
        organizationId: orgId,
        channelId: String(roomId),
        authorizationHeader: authHeader,
      });
      if (!access.allowed) {
        socket.emit('room:error', { roomId, message: 'Forbidden' });
        return;
      }
      socket.join(roomId);
      socket.emit('room:joined', { roomId });
    });

    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      socket.emit('room:left', { roomId });
    });

    socket.on('room:typing_start', ({ roomId } = {}) => {
      if (!roomId || !userId) return;
      const key = String(roomId);
      if (!socket.rooms.has(key)) return;
      socket.to(key).emit('room:typing', {
        userId: String(userId),
        roomId: key,
        isTyping: true,
      });
    });

    socket.on('room:typing_stop', ({ roomId } = {}) => {
      if (!roomId || !userId) return;
      const key = String(roomId);
      if (!socket.rooms.has(key)) return;
      socket.to(key).emit('room:typing', {
        userId: String(userId),
        roomId: key,
        isTyping: false,
      });
    });

    socket.on('room:send', async ({ roomId, organizationId, event = 'room:new_message', payload = {} } = {}) => {
      if (!roomId) return;
      if (!userId) {
        return socket.emit('room:error', { roomId, message: 'Unauthorized' });
      }
      if (
        await emitRateLimited(socket, userId, 'room:send', {
          limit: ROOM_SEND_MAX,
          windowMs: ROOM_SEND_WINDOW_MS,
        })
      ) {
        return;
      }
      const orgId = String(organizationId || '').trim();
      if (!orgId) {
        socket.emit('room:error', { roomId, message: 'organizationId is required' });
        return;
      }
      const { assertOrgChannelSocketAccess } = require('../utils/orgRoomAccess');
      const authHeader = socket.handshake?.headers?.authorization;
      const access = await assertOrgChannelSocketAccess({
        userId: String(userId),
        organizationId: orgId,
        channelId: String(roomId),
        authorizationHeader: authHeader,
      });
      if (!access.allowed) {
        socket.emit('room:error', { roomId, message: 'Forbidden' });
        return;
      }
      emitToRoom(roomId, event, {
        ...payload,
        senderId: userId || null,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async (reason) => {
      if (userId) {
        const key = String(userId);
        redisFriendChatFocus.clear(key).catch(() => null);
        const current = onlineUserSockets.get(key) || 0;
        if (current <= 1) {
          onlineUserSockets.delete(key);
          const applyOffline = async () => {
            // Nếu user đã reconnect trong thời gian grace thì bỏ qua offline.
            const latest = onlineUserSockets.get(key) || 0;
            if (latest > 0) return;
            io.emit('user:disconnected', key);
            io.emit('presence:batch', { userId: key, status: 'offline' });
            redisPresence.clear(key);
            await syncPresenceUserStatus(key, 'offline');
          };
          if (OFFLINE_GRACE_MS > 0) {
            cancelPendingOffline(key);
            const timer = setTimeout(() => {
              pendingOfflineTimers.delete(key);
              applyOffline().catch(() => null);
            }, OFFLINE_GRACE_MS);
            pendingOfflineTimers.set(key, timer);
          } else {
            await applyOffline();
          }
        } else {
          onlineUserSockets.set(key, current - 1);
        }
        io.emit('users:online', Array.from(onlineUserSockets.keys()));
      }
      console.log('[socket-service] user disconnected:', userId, 'reason:', reason);
    });
  });
};

