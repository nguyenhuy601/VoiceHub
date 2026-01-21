import apiClient from './apiClient';

export const chatAPI = {
  // Get all channels
  getChannels: async () => {
    const response = await apiClient.get('/channels');
    return response;
  },

  // Get single channel
  getChannel: async (channelId) => {
    const response = await apiClient.get(`/channels/${channelId}`);
    return response;
  },

  // Create channel
  createChannel: async (data) => {
    const response = await apiClient.post('/channels', data);
    return response;
  },

  // Update channel
  updateChannel: async (channelId, data) => {
    const response = await apiClient.put(`/channels/${channelId}`, data);
    return response;
  },

  // Delete channel
  deleteChannel: async (channelId) => {
    const response = await apiClient.delete(`/channels/${channelId}`);
    return response;
  },

  // Get messages for a channel
  getMessages: async (channelId, params = {}) => {
    const response = await apiClient.get(`/channels/${channelId}/messages`, { params });
    return response;
  },

  // Send message
  sendMessage: async (channelId, data) => {
    const response = await apiClient.post(`/channels/${channelId}/messages`, data);
    return response;
  },

  // Update message
  updateMessage: async (channelId, messageId, data) => {
    const response = await apiClient.put(`/channels/${channelId}/messages/${messageId}`, data);
    return response;
  },

  // Delete message
  deleteMessage: async (channelId, messageId) => {
    const response = await apiClient.delete(`/channels/${channelId}/messages/${messageId}`);
    return response;
  },

  // Add reaction to message
  addReaction: async (channelId, messageId, emoji) => {
    const response = await apiClient.post(`/channels/${channelId}/messages/${messageId}/reactions`, { emoji });
    return response;
  },

  // Remove reaction from message
  removeReaction: async (channelId, messageId, emoji) => {
    const response = await apiClient.delete(`/channels/${channelId}/messages/${messageId}/reactions/${emoji}`);
    return response;
  },

  // Upload file/attachment
  uploadFile: async (channelId, formData) => {
    const response = await apiClient.post(`/channels/${channelId}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response;
  },

  // Get direct messages
  getDirectMessages: async (userId) => {
    const response = await apiClient.get(`/messages/direct/${userId}`);
    return response;
  },

  // Send direct message
  sendDirectMessage: async (userId, data) => {
    const response = await apiClient.post(`/messages/direct/${userId}`, data);
    return response;
  },
};
