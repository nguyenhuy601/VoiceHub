const { socketAuth } = require('/shared/middleware/auth');
const { logger } = require('/shared');
const roomManager = require('../sfu/roomManager');

const getUserFromSocket = (socket) => socket.data?.user || socket.user || {};

function registerVoiceNamespace(io) {
  const voiceNamespace = io.of('/voice');
  voiceNamespace.use(socketAuth);

  voiceNamespace.on('connection', (socket) => {
    const authUser = getUserFromSocket(socket);
    const userId = authUser.id || authUser.userId || authUser._id || socket.id;
    const displayName = authUser.displayName || authUser.username || authUser.email || `user-${userId}`;
    logger.info(`[voice] user connected ${userId} socket:${socket.id}`);

    socket.on('voice:joinRoom', async ({ roomId }, callback = () => {}) => {
      try {
        if (!roomId) throw new Error('roomId is required');

        const joined = await roomManager.joinRoom({
          roomId,
          socketId: socket.id,
          userInfo: { ...authUser, userId, displayName },
        });

        socket.data.voiceRoomId = roomId;
        socket.join(joined.roomTag);

        callback({
          success: true,
          roomId,
          rtpCapabilities: joined.rtpCapabilities,
          peers: joined.peers,
        });

        socket.to(joined.roomTag).emit('voice:peerJoined', {
          socketId: socket.id,
          userId,
          displayName,
        });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:createTransport', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const direction = payload.direction || 'send';
        const transport = await roomManager.createWebRtcTransport({
          roomId,
          socketId: socket.id,
          direction,
        });
        callback({ success: true, transport });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:connectTransport', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.connectTransport({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          dtlsParameters: payload.dtlsParameters,
        });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:produce', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const result = await roomManager.produce({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          kind: payload.kind,
          rtpParameters: payload.rtpParameters,
          appData: payload.appData,
        });

        callback({ success: true, ...result });

        socket.to(`voice:${roomId}`).emit('voice:newProducer', {
          producerId: result.producerId,
          socketId: socket.id,
          userId: result.userId,
          displayName: result.displayName,
          kind: result.kind,
        });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:getProducers', (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const producers = roomManager.getProducersForRoom({ roomId, socketId: socket.id });
        callback({ success: true, producers });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:consume', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const consumer = await roomManager.consume({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities,
        });
        callback({ success: true, consumer });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:resumeConsumer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.resumeConsumer({
          roomId,
          socketId: socket.id,
          consumerId: payload.consumerId,
        });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:pauseProducer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.pauseProducer({
          roomId,
          socketId: socket.id,
          producerId: payload.producerId,
        });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on('voice:resumeProducer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.resumeProducer({
          roomId,
          socketId: socket.id,
          producerId: payload.producerId,
        });
        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    const leave = () => {
      const roomId = socket.data.voiceRoomId;
      if (!roomId) return;
      const left = roomManager.leaveRoom({ roomId, socketId: socket.id });
      socket.leave(`voice:${roomId}`);
      delete socket.data.voiceRoomId;
      if (left.removed) {
        socket.to(`voice:${roomId}`).emit('voice:peerLeft', {
          socketId: socket.id,
          userId: left.userId,
          displayName: left.displayName,
        });
      }
    };

    socket.on('voice:leaveRoom', (_payload, callback = () => {}) => {
      leave();
      callback({ success: true });
    });

    socket.on('disconnect', () => {
      leave();
      logger.info(`[voice] user disconnected ${userId} socket:${socket.id}`);
    });
  });
}

module.exports = registerVoiceNamespace;
