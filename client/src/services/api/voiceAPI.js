import apiClient from './apiClient';

export const voiceAPI = {
  // Get all voice rooms
  getRooms: async () => {
    const response = await apiClient.get('/voice/rooms');
    return response;
  },

  // Get single voice room
  getRoom: async (roomId) => {
    const response = await apiClient.get(`/voice/rooms/${roomId}`);
    return response;
  },

  // Create voice room
  createRoom: async (data) => {
    const response = await apiClient.post('/voice/rooms', data);
    return response;
  },

  // Update voice room
  updateRoom: async (roomId, data) => {
    const response = await apiClient.put(`/voice/rooms/${roomId}`, data);
    return response;
  },

  // Delete voice room
  deleteRoom: async (roomId) => {
    const response = await apiClient.delete(`/voice/rooms/${roomId}`);
    return response;
  },

  // Join voice room
  joinRoom: async (roomId) => {
    const response = await apiClient.post(`/voice/rooms/${roomId}/join`);
    return response;
  },

  // Leave voice room
  leaveRoom: async (roomId) => {
    const response = await apiClient.post(`/voice/rooms/${roomId}/leave`);
    return response;
  },

  // Get room participants
  getParticipants: async (roomId) => {
    const response = await apiClient.get(`/voice/rooms/${roomId}/participants`);
    return response;
  },

  // Update participant status (mute, video, etc.)
  updateParticipantStatus: async (roomId, data) => {
    const response = await apiClient.put(`/voice/rooms/${roomId}/participants/me`, data);
    return response;
  },

  // Get WebRTC ICE servers configuration
  getIceServers: async () => {
    const response = await apiClient.get('/voice/ice-servers');
    return response;
  },

  // Start recording
  startRecording: async (roomId) => {
    const response = await apiClient.post(`/voice/rooms/${roomId}/recording/start`);
    return response;
  },

  // Stop recording
  stopRecording: async (roomId) => {
    const response = await apiClient.post(`/voice/rooms/${roomId}/recording/stop`);
    return response;
  },

  // Get recordings
  getRecordings: async (roomId) => {
    const response = await apiClient.get(`/voice/rooms/${roomId}/recordings`);
    return response;
  },
};
