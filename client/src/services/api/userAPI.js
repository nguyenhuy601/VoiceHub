import apiClient from './apiClient';

export const userAPI = {
  // Get current user profile
  getProfile: async () => {
    const response = await apiClient.get('/users/me');
    return response;
  },

  // Get user by ID
  getUser: async (userId) => {
    const response = await apiClient.get(`/users/${userId}`);
    return response;
  },

  // Update user profile
  updateProfile: async (data) => {
    const response = await apiClient.put('/users/me', data);
    return response;
  },

  // Upload avatar
  uploadAvatar: async (formData) => {
    const response = await apiClient.post('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response;
  },

  // Update password
  updatePassword: async (data) => {
    const response = await apiClient.put('/users/me/password', data);
    return response;
  },

  // Update settings
  updateSettings: async (data) => {
    const response = await apiClient.put('/users/me/settings', data);
    return response;
  },

  // Get user settings
  getSettings: async () => {
    const response = await apiClient.get('/users/me/settings');
    return response;
  },

  // Search users
  searchUsers: async (query) => {
    const response = await apiClient.get('/users/search', { params: { q: query } });
    return response;
  },

  // Get user statistics
  getUserStats: async () => {
    const response = await apiClient.get('/users/me/stats');
    return response;
  },
};
