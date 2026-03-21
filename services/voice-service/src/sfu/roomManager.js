const { logger } = require('/shared');
const mediasoupConfig = require('../config/mediasoup.config');

let mediasoup;
try {
  mediasoup = require('mediasoup');
} catch (error) {
  logger.error('mediasoup is not installed. Run `npm install` in voice-service.', error);
  mediasoup = null;
}

class RoomManager {
  constructor() {
    this.worker = null;
    this.rooms = new Map();
  }

  async init() {
    if (!mediasoup) {
      throw new Error('mediasoup dependency is missing');
    }

    this.worker = await mediasoup.createWorker(mediasoupConfig.worker);
    this.worker.on('died', () => {
      logger.error('mediasoup worker died, exiting process in 2s');
      setTimeout(() => process.exit(1), 2000);
    });
    logger.info('mediasoup worker initialized');
  }

  _roomTag(roomId) {
    return `voice:${roomId}`;
  }

  async getOrCreateRoom(roomId) {
    if (!this.worker) {
      throw new Error('Room manager is not initialized');
    }

    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const router = await this.worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
    });

    const room = {
      roomId,
      roomTag: this._roomTag(roomId),
      router,
      peers: new Map(),
    };

    this.rooms.set(roomId, room);
    logger.info(`Created SFU room ${roomId}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  _ensurePeer(room, socketId, userInfo = {}) {
    if (room.peers.has(socketId)) {
      return room.peers.get(socketId);
    }

    const peer = {
      socketId,
      userId: userInfo.userId || userInfo.id || socketId,
      displayName: userInfo.displayName || userInfo.username || 'user',
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };
    room.peers.set(socketId, peer);
    return peer;
  }

  async joinRoom({ roomId, socketId, userInfo }) {
    const room = await this.getOrCreateRoom(roomId);
    const peer = this._ensurePeer(room, socketId, userInfo);

    return {
      roomId,
      roomTag: room.roomTag,
      peer,
      rtpCapabilities: room.router.rtpCapabilities,
      peers: [...room.peers.values()].map((p) => ({
        socketId: p.socketId,
        userId: p.userId,
        displayName: p.displayName,
      })),
    };
  }

  async createWebRtcTransport({ roomId, socketId, direction }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found in room');

    const transport = await room.router.createWebRtcTransport(mediasoupConfig.webRtcTransport);
    transport.appData = {
      direction: direction || 'send',
      socketId,
      roomId,
    };

    peer.transports.set(transport.id, transport);

    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed') {
        transport.close();
        peer.transports.delete(transport.id);
      }
    });

    transport.on('close', () => {
      peer.transports.delete(transport.id);
    });

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport({ roomId, socketId, transportId, dtlsParameters }) {
    const transport = this._getPeerTransport({ roomId, socketId, transportId });
    await transport.connect({ dtlsParameters });
  }

  async produce({ roomId, socketId, transportId, kind, rtpParameters, appData }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: appData || {},
    });

    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      peer.producers.delete(producer.id);
    });

    producer.on('close', () => {
      peer.producers.delete(producer.id);
    });

    return {
      producerId: producer.id,
      kind: producer.kind,
      userId: peer.userId,
      displayName: peer.displayName,
    };
  }

  async consume({ roomId, socketId, transportId, producerId, rtpCapabilities }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Router cannot consume producer with provided RTP capabilities');
    }

    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      peer.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      peer.consumers.delete(consumer.id);
    });

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  async resumeConsumer({ roomId, socketId, consumerId }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found');

    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');
    await consumer.resume();
  }

  async pauseProducer({ roomId, socketId, producerId }) {
    const producer = this._getPeerProducer({ roomId, socketId, producerId });
    await producer.pause();
  }

  async resumeProducer({ roomId, socketId, producerId }) {
    const producer = this._getPeerProducer({ roomId, socketId, producerId });
    await producer.resume();
  }

  getProducersForRoom({ roomId, socketId }) {
    const room = this.getRoom(roomId);
    if (!room) return [];

    const items = [];
    for (const peer of room.peers.values()) {
      if (peer.socketId === socketId) continue;
      for (const producer of peer.producers.values()) {
        items.push({
          producerId: producer.id,
          socketId: peer.socketId,
          userId: peer.userId,
          displayName: peer.displayName,
          kind: producer.kind,
        });
      }
    }
    return items;
  }

  leaveRoom({ roomId, socketId }) {
    const room = this.getRoom(roomId);
    if (!room) return { removed: false, roomClosed: false };

    const peer = room.peers.get(socketId);
    if (!peer) return { removed: false, roomClosed: false };

    for (const consumer of peer.consumers.values()) consumer.close();
    for (const producer of peer.producers.values()) producer.close();
    for (const transport of peer.transports.values()) transport.close();
    room.peers.delete(socketId);

    const roomClosed = room.peers.size === 0;
    if (roomClosed) {
      room.router.close();
      this.rooms.delete(roomId);
      logger.info(`Closed SFU room ${roomId}`);
    }

    return {
      removed: true,
      roomClosed,
      userId: peer.userId,
      displayName: peer.displayName,
    };
  }

  _getPeerTransport({ roomId, socketId, transportId }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found');
    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    return transport;
  }

  _getPeerProducer({ roomId, socketId, producerId }) {
    const room = this.getRoom(roomId);
    if (!room) throw new Error('Room not found');
    const peer = room.peers.get(socketId);
    if (!peer) throw new Error('Peer not found');
    const producer = peer.producers.get(producerId);
    if (!producer) throw new Error('Producer not found');
    return producer;
  }
}

module.exports = new RoomManager();
