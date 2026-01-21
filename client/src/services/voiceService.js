import api from './api';

const voiceService = {
  // Create voice room
  createRoom: async (data) => {
    return await api.post('/voice/rooms', data);
  },

  // Get room info
  getRoom: async (roomId) => {
    return await api.get(`/voice/rooms/${roomId}`);
  },

  // Join room
  joinRoom: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/join`);
  },

  // Leave room
  leaveRoom: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/leave`);
  },

  // Get participants
  getParticipants: async (roomId) => {
    return await api.get(`/voice/rooms/${roomId}/participants`);
  },

  // Toggle mute
  toggleMute: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/mute`);
  },

  // Toggle video
  toggleVideo: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/video`);
  },

  // Start screen share
  startScreenShare: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/screen-share/start`);
  },

  // Stop screen share
  stopScreenShare: async (roomId) => {
    return await api.post(`/voice/rooms/${roomId}/screen-share/stop`);
  },

  // Get TURN credentials
  getTurnCredentials: async () => {
    return await api.get('/voice/turn-credentials');
  },
};

export default voiceService;
