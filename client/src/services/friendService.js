/* ========================================
   FRIENDSERVICE.JS - FRIENDS API SERVICE
   Quản lý bạn bè, friend requests, block/unblock
   Kết nối: friend-service

   Flow thêm bạn:
   1. A gửi request → sendRequest(B.id)
   2. B nhận pending request
   3. B accept → acceptFriend(B.id người gửi)
   4. A và B trở thành friends
======================================== */
import api from './api';

function friendActionPath(friendId, action) {
  return `/friends/${encodeURIComponent(String(friendId))}/${action}`;
}

const friendService = {
  getFriends: async (params = {}) => {
    return await api.get('/friends', { params });
  },

  sendRequest: async (userId) => {
    return await api.post('/friends/request', { userId });
  },

  acceptFriend: async (friendId) => {
    return await api.post(friendActionPath(friendId, 'accept'));
  },

  rejectFriend: async (friendId) => {
    return await api.post(friendActionPath(friendId, 'reject'));
  },

  getPendingRequests: async (config = {}) => {
    return await api.get('/friends/pending', config);
  },

  blockUser: async (userId) => {
    return await api.post(friendActionPath(userId, 'block'));
  },

  unblockUser: async (userId) => {
    return await api.post(friendActionPath(userId, 'unblock'));
  },

  blockFriend: async (friendId) => {
    return await api.post(friendActionPath(friendId, 'block'));
  },

  unblockFriend: async (friendId) => {
    return await api.post(friendActionPath(friendId, 'unblock'));
  },

  searchByPhone: async (phone) => {
    return await api.get(`/friends/search?phone=${encodeURIComponent(phone)}`);
  },
};

export default friendService;
