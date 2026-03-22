/* ========================================
   FRIENDSERVICE.JS - FRIENDS API SERVICE
   Quản lý bạn bè, friend requests, block/unblock
   Kết nối: friend-service (port 4005)
   
   Flow thêm bạn:
   1. A gửi request → sendRequest(B.id)
   2. B nhận pending request
   3. B accept → acceptRequest(requestId)
   4. A và B trở thành friends
======================================== */
import api from './api';

const isNotFound = (error) => error?.response?.status === 404 || error?.status === 404;

const requestWithFallback = async (requestFactories) => {
  let lastError;
  for (let i = 0; i < requestFactories.length; i += 1) {
    try {
      return await requestFactories[i]();
    } catch (error) {
      lastError = error;
      if (!isNotFound(error) || i === requestFactories.length - 1) {
        throw error;
      }
    }
  }
  throw lastError;
};

const friendService = {
  // Lấy danh sách bạn bè - GET /friends
  // Return: [{ id, name, avatar, status, ... }]
  getFriends: async () => {
    return await api.get('/friends');
  },

  // Gửi lời mời kết bạn - POST /friends/request
  // userId: ID của người muốn kết bạn
  sendRequest: async (userId) => {
    return await requestWithFallback([
      () => api.post('/friends/request', { userId }),
      () => api.post('/friends/request', { friendId: userId }),
    ]);
  },

  // Chấp nhận lời mời kết bạn
  // Có 2 chuẩn route đang tồn tại trong dự án:
  // - new: /friends/:friendId/accept
  // - legacy: /friends/accept/:requestId
  acceptRequest: async (id) => {
    return await requestWithFallback([
      () => api.post(`/friends/${id}/accept`),
      () => api.post(`/friends/accept/${id}`),
    ]);
  },

  // Từ chối lời mời kết bạn
  // Hỗ trợ cả legacy và new route
  rejectRequest: async (id) => {
    return await requestWithFallback([
      () => api.post(`/friends/${id}/reject`),
      () => api.delete(`/friends/reject/${id}`),
    ]);
  },

  // Xóa bạn - DELETE /friends/:friendId
  // friendId: ID của bạn bè muốn xóa
  removeFriend: async (friendId) => {
    return await api.delete(`/friends/${friendId}`);
  },

  // Lấy các lời mời chờ duyệt
  // Return: [{ id, from/requester/userId: {...}, createdAt, ... }]
  getPendingRequests: async () => {
    return await requestWithFallback([
      () => api.get('/friends/requests', { params: { type: 'received' } }),
      () => api.get('/friends/pending'),
    ]);
  },

  // Chặn user - POST /friends/block
  // Khi block: không nhận message, không thấy online status
  blockUser: async (userId) => {
    return await requestWithFallback([
      () => api.post(`/friends/${userId}/block`),
      () => api.post('/friends/block', { userId }),
    ]);
  },

  // Bỏ chặn - DELETE /friends/unblock/:userId
  unblockUser: async (userId) => {
    return await requestWithFallback([
      () => api.post(`/friends/${userId}/unblock`),
      () => api.delete(`/friends/unblock/${userId}`),
    ]);
  },

  // Tìm bạn theo số điện thoại
  searchByPhone: async (phone) => {
    return await api.get(`/friends/search?phone=${encodeURIComponent(phone)}`);
  },
};

export default friendService;
