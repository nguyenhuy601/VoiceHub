let chatNamespace = null;

function setChatNamespace(namespace) {
  chatNamespace = namespace;
}

function emitToUser(userId, event, payload) {
  if (!chatNamespace || !userId || !event) return 0;
  chatNamespace.to(`user:${userId}`).emit(event, payload);
  return 1;
}

function emitToUsers(userIds, event, payload) {
  if (!Array.isArray(userIds) || !event) return 0;
  let count = 0;
  userIds.forEach((userId) => {
    count += emitToUser(userId, event, payload);
  });
  return count;
}

function emitToRoom(roomId, event, payload) {
  if (!chatNamespace || !roomId || !event) return 0;
  chatNamespace.to(roomId).emit(event, payload);
  return 1;
}

function emitBroadcast(event, payload) {
  if (!chatNamespace || !event) return 0;
  chatNamespace.emit(event, payload);
  return 1;
}

function publishRealtimeEvent(eventPayload = {}) {
  const {
    event,
    payload = {},
    userId,
    userIds,
    roomId,
    broadcast = false,
  } = eventPayload;

  if (!event) {
    return { ok: false, reason: 'event is required', delivered: 0 };
  }
  if (!chatNamespace) {
    return { ok: false, reason: 'chat namespace not ready', delivered: 0 };
  }

  let delivered = 0;
  if (userId) delivered += emitToUser(userId, event, payload);
  if (Array.isArray(userIds) && userIds.length > 0) delivered += emitToUsers(userIds, event, payload);
  if (roomId) delivered += emitToRoom(roomId, event, payload);
  if (broadcast) delivered += emitBroadcast(event, payload);

  if (delivered === 0) {
    return { ok: false, reason: 'no target provided', delivered: 0 };
  }
  return { ok: true, delivered };
}

module.exports = {
  setChatNamespace,
  publishRealtimeEvent,
  emitToUser,
  emitToUsers,
  emitToRoom,
  emitBroadcast,
};
