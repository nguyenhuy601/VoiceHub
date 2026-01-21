import apiClient from './apiClient';

export const friendAPI = {
  // Get all friends
  getFriends: async () => {
    const response = await apiClient.get('/friends');
    return response;
  },

  // Get friend requests
  getFriendRequests: async () => {
    const response = await apiClient.get('/friends/requests');
    return response;
  },

  // Send friend request
  sendFriendRequest: async (userId) => {
    const response = await apiClient.post('/friends/request', { recipientId: userId });
    return response;
  },

  // Accept friend request
  acceptFriendRequest: async (requestId) => {
    const response = await apiClient.put(`/friends/requests/${requestId}/accept`);
    return response;
  },

  // Reject friend request
  rejectFriendRequest: async (requestId) => {
    const response = await apiClient.put(`/friends/requests/${requestId}/reject`);
    return response;
  },

  // Remove friend
  removeFriend: async (friendId) => {
    const response = await apiClient.delete(`/friends/${friendId}`);
    return response;
  },

  // Block user
  blockUser: async (userId) => {
    const response = await apiClient.post('/friends/block', { userId });
    return response;
  },

  // Unblock user
  unblockUser: async (userId) => {
    const response = await apiClient.delete(`/friends/block/${userId}`);
    return response;
  },

  // Get blocked users
  getBlockedUsers: async () => {
    const response = await apiClient.get('/friends/blocked');
    return response;
  },

  // Search users
  searchUsers: async (query) => {
    const response = await apiClient.get('/users/search', { params: { q: query } });
    return response;
  },
};
