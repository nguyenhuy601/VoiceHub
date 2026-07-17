/** Bridge for services to emit voice namespace events without circular imports. */
let voiceNamespace = null;

function setVoiceNamespace(ns) {
  voiceNamespace = ns;
}

function broadcastToRoom(roomId, event, payload) {
  if (!voiceNamespace || !roomId) return;
  voiceNamespace.to(`voice:${String(roomId)}`).emit(event, payload);
}

function broadcastTranscriptPartial(roomId, payload) {
  broadcastToRoom(roomId, 'voice:transcript:partial', payload);
}

function emitToSocketIds(socketIds, event, payload) {
  if (!voiceNamespace || !Array.isArray(socketIds)) return;
  for (const socketId of socketIds) {
    const sock = voiceNamespace.sockets.get(socketId);
    if (!sock) continue;
    sock.emit(event, payload);
  }
}

module.exports = {
  setVoiceNamespace,
  broadcastToRoom,
  broadcastTranscriptPartial,
  emitToSocketIds,
};
