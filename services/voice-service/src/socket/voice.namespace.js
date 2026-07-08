const { socketAuth } = require('@enterprise/shared/middleware/auth');
const { logger } = require('@enterprise/shared');
const roomManager = require('../sfu/roomManager');
const voiceRoomSessionService = require('../services/voiceRoomSession.service');
const voiceRoomLobby = require('../services/voiceRoomLobby.service');
const roomServerRecording = require('../services/roomServerRecording.service');
const roomServerSttTap = require('../services/roomServerSttTap.service');
const meetingFeaturePermission = require('../services/meetingFeaturePermission.service');
const meetingAiSummary = require('../services/meetingAiSummary.service');
const Meeting = require('../models/Meeting');
const voiceBroadcast = require('./voiceBroadcast');

const getUserFromSocket = (socket) => socket.data?.user || socket.user || {};
const callbackError = (error, eventName = 'voice') => {
  const msg = error?.message || 'Không thể xử lý thao tác thoại lúc này';
  logger.warn(`[voice] ${eventName} failed: ${msg}`);
  return { success: false, error: msg };
};

/** Grace period trước khi đóng phòng khi disconnect (F5 / mất mạng tạm thời). */
const pendingRoomFinalize = new Map();

function getDisconnectGraceMs() {
  return Math.max(5000, Number(process.env.VOICE_DISCONNECT_GRACE_MS || 45000));
}

function cancelPendingRoomFinalize(roomId) {
  const roomKey = String(roomId || '').trim();
  if (!roomKey) return;
  const pending = pendingRoomFinalize.get(roomKey);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingRoomFinalize.delete(roomKey);
  logger.info(`[voice] cancelled pending room finalize room=${roomKey}`);
}

async function finalizeEmptyVoiceRoom(voiceNamespace, roomId) {
  const roomKey = String(roomId || '').trim();
  if (!roomKey) return null;

  pendingRoomFinalize.delete(roomKey);

  const room = roomManager.getRoom(roomKey);
  if (room && room.peers.size > 0) {
    logger.info(`[voice] skip finalize — peer rejoined room=${roomKey}`);
    return null;
  }

  let closedPayload = { roomId: roomKey, recordingSaved: false };
  try {
    const finalized = await voiceRoomSessionService.finalizeRoomSession(roomKey);
    if (finalized) {
      closedPayload = { ...closedPayload, ...finalized };
    }
  } catch (finalizeErr) {
    logger.error(`[voice] finalize session failed room=${roomKey}:`, finalizeErr);
  }

  const roomTag = `voice:${roomKey}`;
  voiceNamespace.to(roomTag).emit('voice:roomClosed', closedPayload);
  logger.info(`[voice] room finalized after grace room=${roomKey}`);
  return closedPayload;
}

function scheduleEmptyRoomFinalize(voiceNamespace, roomId) {
  const roomKey = String(roomId || '').trim();
  if (!roomKey) return;
  cancelPendingRoomFinalize(roomKey);
  const graceMs = getDisconnectGraceMs();
  const timer = setTimeout(() => {
    finalizeEmptyVoiceRoom(voiceNamespace, roomKey).catch((err) => {
      logger.error(`[voice] delayed finalize failed room=${roomKey}:`, err);
    });
  }, graceMs);
  pendingRoomFinalizeUnref(timer);
  pendingRoomFinalize.set(roomKey, { timer });
  logger.info(`[voice] scheduled room finalize room=${roomKey} in ${graceMs}ms`);
}

function pendingRoomFinalizeUnref(timer) {
  if (typeof timer?.unref === 'function') timer.unref();
}

function registerVoiceNamespace(io) {
  const voiceNamespace = io.of('/voice');
  voiceBroadcast.setVoiceNamespace(voiceNamespace);
  voiceNamespace.use(socketAuth);

  voiceNamespace.on('connection', (socket) => {
    const authUser = getUserFromSocket(socket);
    const userId = authUser.id || authUser.userId || authUser._id || socket.id;
    const displayName = authUser.displayName || authUser.username || authUser.email || `user-${userId}`;
    logger.info(`[voice] user connected ${userId} socket:${socket.id}`);

    socket.on('voice:joinRoom', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId;
        if (!roomId) throw new Error('roomId is required');

        cancelPendingRoomFinalize(roomId);

        const voiceRoomAccess = require('../services/voiceRoomAccess.service');
        const authHeader = socket.handshake?.headers?.authorization;
        await voiceRoomAccess.assertVoiceRoomAccess({
          roomId: String(roomId),
          userId: String(userId),
          organizationId: payload.organizationId,
          authorizationHeader: authHeader,
        });

        const joined = await roomManager.joinRoom({
          roomId,
          socketId: socket.id,
          userInfo: { ...authUser, userId, displayName },
        });

        const peerCount = Array.isArray(joined.peers) ? joined.peers.length : 1;
        let sessionMeta = null;
        try {
          sessionMeta = await voiceRoomSessionService.onUserJoinRoom({
            roomId: String(roomId),
            userId,
            organizationId: payload.organizationId,
            channelLabel: payload.channelLabel || payload.displayName,
            peerCount,
          });
        } catch (sessionErr) {
          logger.warn(`[voice] session start skipped room=${roomId}: ${sessionErr.message}`);
        }

        socket.data.voiceRoomId = roomId;
        socket.data.voiceJoinedAt = Date.now();
        socket.join(joined.roomTag);

        if (sessionMeta?.meetingId) {
          roomServerRecording.bindMeeting(String(roomId), sessionMeta.meetingId);
          roomServerSttTap.bindMeeting(String(roomId), sessionMeta.meetingId);
        }

        const hostId = sessionMeta?.hostId || null;
        const grantedFeatures = hostId
          ? await meetingFeaturePermission.getGrantedFeaturesForUser(String(roomId), userId, hostId)
          : [];

        callback({
          success: true,
          roomId,
          rtpCapabilities: joined.rtpCapabilities,
          peers: joined.peers,
          meetingId: sessionMeta?.meetingId || null,
          hostId,
          recordingMode: roomServerRecording.getRecordingMode(),
          grantedFeatures,
          legacyAutoRecord: roomServerRecording.isLegacyAutoRecord(),
        });

        socket.to(joined.roomTag).emit('voice:peerJoined', {
          socketId: socket.id,
          userId,
          displayName,
        });
      } catch (error) {
        const msg = error?.statusCode === 403 ? 'Forbidden' : error?.message;
        callback({ success: false, error: msg || 'Không thể tham gia phòng thoại' });
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
        callback(callbackError(error, 'voice:createTransport'));
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
        callback(callbackError(error, 'voice:connectTransport'));
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

        if (result.kind === 'audio') {
          const roomKey = String(roomId);
          const sessionMeetingId = voiceRoomSessionService.getActiveMeetingId(roomKey);
          void roomServerRecording.attachProducer({
            roomId: roomKey,
            producerId: result.producerId,
            userId: result.userId,
            displayName: result.displayName,
            meetingId: sessionMeetingId,
          });
          void roomServerSttTap.attachProducerTap({
            roomId: roomKey,
            producerId: result.producerId,
            userId: result.userId,
            displayName: result.displayName,
            meetingId: sessionMeetingId,
          });
        }

        socket.to(`voice:${roomId}`).emit('voice:newProducer', {
          producerId: result.producerId,
          socketId: socket.id,
          userId: result.userId,
          displayName: result.displayName,
          kind: result.kind,
        });
      } catch (error) {
        callback(callbackError(error, 'voice:produce'));
      }
    });

    socket.on('voice:getProducers', (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const producers = roomManager.getProducersForRoom({ roomId, socketId: socket.id });
        callback({ success: true, producers });
      } catch (error) {
        callback(callbackError(error, 'voice:getProducers'));
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
        callback(callbackError(error, 'voice:consume'));
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
        callback(callbackError(error, 'voice:resumeConsumer'));
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
        callback(callbackError(error, 'voice:pauseProducer'));
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
        callback(callbackError(error, 'voice:resumeProducer'));
      }
    });

    const leave = async ({ immediate = false } = {}) => {
      const roomId = socket.data.voiceRoomId;
      if (!roomId) return;
      const roomTag = `voice:${roomId}`;
      const left = roomManager.leaveRoom({ roomId, socketId: socket.id });
      if (left.removed) {
        socket.to(roomTag).emit('voice:peerLeft', {
          socketId: socket.id,
          userId: left.userId,
          displayName: left.displayName,
        });
      }
      if (left.roomClosed) {
        if (immediate) {
          cancelPendingRoomFinalize(roomId);
          const closedPayload = await finalizeEmptyVoiceRoom(voiceNamespace, roomId);
          if (closedPayload) {
            socket.emit('voice:roomClosed', closedPayload);
          }
        } else {
          scheduleEmptyRoomFinalize(voiceNamespace, roomId);
        }
      }
      socket.leave(roomTag);
      delete socket.data.voiceRoomId;
      delete socket.data.voiceJoinedAt;
    };

    const finalizeAndBroadcastRoomClosed = async (roomId) => {
      cancelPendingRoomFinalize(roomId);
      const roomTag = `voice:${roomId}`;
      let closedPayload = { roomId: String(roomId), recordingSaved: false };
      try {
        const finalized = await voiceRoomSessionService.finalizeRoomSession(roomId);
        if (finalized) {
          closedPayload = { ...closedPayload, ...finalized };
        }
      } catch (finalizeErr) {
        logger.error(`[voice] finalize session failed room=${roomId}:`, finalizeErr);
      }
      voiceNamespace.to(roomTag).emit('voice:roomClosed', closedPayload);
      return closedPayload;
    };

    socket.on('voice:feature:request', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const session = voiceRoomSessionService.getActiveSession(roomId);
        const request = await meetingFeaturePermission.createFeatureRequest({
          roomId: String(roomId),
          meetingId: session?.meetingId,
          userId,
          displayName,
          type: payload.type,
        });
        const roomTag = `voice:${roomId}`;
        socket.to(roomTag).emit('voice:feature:requestPending', { request });
        callback({ success: true, request });
      } catch (error) {
        callback(callbackError(error, 'voice:feature:request'));
      }
    });

    socket.on('voice:feature:resolve', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const request = await meetingFeaturePermission.resolveFeatureRequest({
          roomId: String(roomId),
          requestId: payload.requestId,
          hostUserId: userId,
          approved: Boolean(payload.approved),
        });
        const roomTag = `voice:${roomId}`;
        voiceNamespace.to(roomTag).emit('voice:feature:granted', {
          userId: request.userId,
          type: request.type,
          approved: request.status === 'approved',
        });
        callback({ success: true, request });
      } catch (error) {
        callback(callbackError(error, 'voice:feature:resolve'));
      }
    });

    socket.on('voice:recording:start', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const session = voiceRoomSessionService.getActiveSession(roomId);
        if (!session?.meetingId) throw new Error('No active meeting');

        const canRecord = await meetingFeaturePermission.userCanUseFeature({
          roomId: String(roomId),
          userId,
          type: 'recording',
          hostId: session.hostId,
        });
        if (!canRecord) {
          callback({ success: false, error: 'Forbidden — recording permission required' });
          return;
        }

        const meeting = await Meeting.findById(session.meetingId).lean();
        const skipTranscript = meeting?.transcriptSource === 'realtime';

        const result = await roomServerRecording.startUserSegment({
          roomId: String(roomId),
          userId,
          meetingId: session.meetingId,
          skipTranscript,
        });

        await Meeting.findByIdAndUpdate(session.meetingId, { $set: { isRecording: true } });

        const roomTag = `voice:${roomId}`;
        voiceNamespace.to(roomTag).emit('voice:recording:started', {
          startedBy: String(userId),
          displayName,
          startedAt: result.startedAt,
        });

        callback({ success: true, ...result });
      } catch (error) {
        callback(callbackError(error, 'voice:recording:start'));
      }
    });

    socket.on('voice:recording:stop', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const session = voiceRoomSessionService.getActiveSession(roomId);
        if (!session?.meetingId) throw new Error('No active meeting');

        const meeting = await Meeting.findById(session.meetingId).lean();
        const skipTranscript = meeting?.transcriptSource === 'realtime';

        const result = await roomServerRecording.stopUserSegment({
          roomId: String(roomId),
          meetingId: session.meetingId,
          skipTranscript,
        });

        await Meeting.findByIdAndUpdate(session.meetingId, { $set: { isRecording: false } });

        const roomTag = `voice:${roomId}`;
        if (result.segment) {
          voiceNamespace.to(roomTag).emit('voice:recording:segmentReady', {
            segment: result.segment,
            stoppedBy: String(userId),
          });
        }

        callback({ success: true, ...result });
      } catch (error) {
        callback(callbackError(error, 'voice:recording:stop'));
      }
    });

    socket.on('voice:aiSummary:enable', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const session = voiceRoomSessionService.getActiveSession(roomId);
        if (!session?.meetingId) throw new Error('No active meeting');

        const canEnable = await meetingFeaturePermission.userCanUseFeature({
          roomId: String(roomId),
          userId,
          type: 'ai_summary',
          hostId: session.hostId,
        });
        if (!canEnable) {
          callback({ success: false, error: 'Forbidden — AI summary permission required' });
          return;
        }

        await meetingAiSummary.enableRoomSummary({
          roomId: String(roomId),
          meetingId: session.meetingId,
        });
        await roomServerSttTap.startRoomSttTap({
          roomId: String(roomId),
          meetingId: session.meetingId,
        });

        const roomTag = `voice:${roomId}`;
        voiceNamespace.to(roomTag).emit('voice:aiSummary:enabled', {
          enabledBy: String(userId),
          displayName,
        });

        callback({ success: true, enabled: true });
      } catch (error) {
        callback(callbackError(error, 'voice:aiSummary:enable'));
      }
    });

    socket.on('voice:aiSummary:disable', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');
        const session = voiceRoomSessionService.getActiveSession(roomId);
        await meetingAiSummary.disableRoomSummary({
          roomId: String(roomId),
          meetingId: session?.meetingId,
        });
        await roomServerSttTap.stopRoomSttTap(String(roomId));

        const roomTag = `voice:${roomId}`;
        voiceNamespace.to(roomTag).emit('voice:aiSummary:disabled', {
          disabledBy: String(userId),
        });

        callback({ success: true, enabled: false });
      } catch (error) {
        callback(callbackError(error, 'voice:aiSummary:disable'));
      }
    });

    socket.on('voice:endRoomAsHost', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        if (!roomId) throw new Error('roomId is required');

        const allowed = await voiceRoomLobby.canActAsRoomHost(roomId, userId);
        if (!allowed) {
          callback({ success: false, error: 'Forbidden' });
          return;
        }

        const roomTag = `voice:${roomId}`;
        const closed = roomManager.closeRoom(roomId);
        const closedPayload = await finalizeAndBroadcastRoomClosed(roomId);

        try {
          const { isFreePublicLobbyRoom } = require('../utils/voiceRoomKind');
          if (isFreePublicLobbyRoom(roomId)) {
            await voiceRoomLobby.destroyLobby(roomId);
          }
        } catch (lobbyErr) {
          logger.warn(`[voice] lobby destroy on host end failed room=${roomId}: ${lobbyErr.message}`);
        }

        for (const peer of closed.evicted || []) {
          const peerSocket = voiceNamespace.sockets.get(peer.socketId);
          if (!peerSocket) continue;
          peerSocket.leave(roomTag);
          delete peerSocket.data.voiceRoomId;
          delete peerSocket.data.voiceJoinedAt;
          peerSocket.emit('voice:roomClosed', closedPayload);
        }

        socket.leave(roomTag);
        delete socket.data.voiceRoomId;
        delete socket.data.voiceJoinedAt;

        callback({ success: true, ...closedPayload });
      } catch (error) {
        callback({ success: false, error: error?.message || 'Không thể kết thúc phòng' });
      }
    });

    socket.on('voice:leaveRoom', async (_payload, callback = () => {}) => {
      await leave({ immediate: true });
      callback({ success: true });
    });

    socket.on('disconnect', () => {
      void leave({ immediate: false });
      logger.info(`[voice] user disconnected ${userId} socket:${socket.id}`);
    });
  });
}

module.exports = registerVoiceNamespace;
