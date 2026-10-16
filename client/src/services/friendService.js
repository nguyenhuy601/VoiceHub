/* ========================================
   FRIENDSERVICE.JS — derived DM roster
   Graph request/accept/block retired (410 FRIEND_GRAPH_GONE).
   Roster: GET /friends from organization-service.
======================================== */
import api from './api';

const friendService = {
  getFriends: async (params = {}) => {
    return await api.get('/friends', { params });
  },

  /** @deprecated Graph gone — returns empty. */
  getPendingRequests: async () => ({ data: { success: true, data: [] } }),

  /** @deprecated Graph gone — soft no-op (UI retired). */
  sendRequest: async () => ({ data: { success: false, errorCode: 'FRIEND_GRAPH_GONE' } }),

  /** @deprecated Graph gone — soft no-op. */
  acceptFriend: async () => ({ data: { success: false, errorCode: 'FRIEND_GRAPH_GONE' } }),

  /** @deprecated Graph gone — soft no-op. */
  rejectFriend: async () => ({ data: { success: false, errorCode: 'FRIEND_GRAPH_GONE' } }),

  /** @deprecated Graph gone — soft no-op. */
  blockUser: async () => ({ data: { success: false, errorCode: 'FRIEND_GRAPH_GONE' } }),

  /** @deprecated Graph gone — soft no-op. */
  unblockUser: async () => ({ data: { success: false, errorCode: 'FRIEND_GRAPH_GONE' } }),

  blockFriend: async (friendId) => friendService.blockUser(friendId),
  unblockFriend: async (friendId) => friendService.unblockUser(friendId),

  /** @deprecated Graph gone — soft no-op. */
  searchByPhone: async () => ({ data: { success: false, data: null, errorCode: 'FRIEND_GRAPH_GONE' } }),
};

export default friendService;
