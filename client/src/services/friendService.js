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

const friendService = {
  // Lấy danh sách bạn bè - GET /friends
  // Return: [{ id, name, avatar, status, ... }]
  getFriends: async () => {
    return await api.get('/friends');
  },

  // Gửi lời mời kết bạn - POST /friends/request
  // userId: ID của người muốn kết bạn (backend nhận field friendId)
  sendRequest: async (userId) => {
    return await api.post('/friends/request', { friendId: userId });
  },

  // Chấp nhận lời mời - POST /friends/:friendId/accept (friendId = id người gửi lời mời)
  acceptRequest: async (friendId) => {
    return await api.post(`/friends/${friendId}/accept`);
  },

  // Từ chối lời mời - POST /friends/:friendId/reject (friendId = id người gửi lời mời)
  rejectRequest: async (friendId) => {
    return await api.post(`/friends/${friendId}/reject`);
  },

  // Xóa bạn - DELETE /friends/:friendId
  // friendId: ID của bạn bè muốn xóa
  removeFriend: async (friendId) => {
    return await api.delete(`/friends/${friendId}`);
  },

  // Lấy lời mời nhận được - GET /friends/requests?type=received
  // Return: { data: [{ _id, userId: { _id, username, displayName, avatar }, createdAt }, ...] }
  getPendingRequests: async () => {
    return await api.get('/friends/requests?type=received');
  },

  // Chặn user - POST /friends/block
  // Khi block: không nhận message, không thấy online status
  blockUser: async (userId) => {
    return await api.post('/friends/block', { userId });
  },

  // Bỏ chặn - DELETE /friends/unblock/:userId
  unblockUser: async (userId) => {
    return await api.delete(`/friends/unblock/${userId}`);
  },

  // Tìm bạn theo số điện thoại
  searchByPhone: async (phone) => {
    return await api.get(`/friends/search?phone=${encodeURIComponent(phone)}`);
  },
};

export default friendService;
