import api from './api';

const unwrap = (resp) => {
  const payload = resp?.data ?? resp;
  return payload?.data !== undefined ? payload.data : payload;
};

const DM_PAGE_SIZE = 50;

export const dmMessageService = {
  pageSize: DM_PAGE_SIZE,

  /**
   * GET /messages?receiverId=&limit= — pagination qua pageToken (không gửi page legacy).
   * @param {string} peerId
   * @param {{ pageToken?: string|null, limit?: number }} opts
   */
  getConversation(peerId, opts = {}) {
    const normalized =
      typeof opts === 'number'
        ? { limit: opts }
        : opts && typeof opts === 'object'
          ? opts
          : {};
    const params = {
      receiverId: peerId,
      limit: normalized.limit ?? DM_PAGE_SIZE,
      fields: 'summary',
    };
    if (normalized.pageToken) {
      params.pageToken = normalized.pageToken;
    }
    return api.get('/messages', { params });
  },

  /** GET /messages?receiverId=&markConversationRead=1 */
  markConversationRead(peerId) {
    return api.get('/messages', {
      params: { receiverId: peerId, markConversationRead: 1 },
    });
  },

  /** GET /messages?unreadByPeer=1 */
  getUnreadByPeer() {
    return api.get('/messages', { params: { unreadByPeer: 1 } });
  },

  addReaction(messageId, emoji) {
    return api.post(`/messages/${messageId}/reactions`, { emoji });
  },

  removeReaction(messageId, emoji) {
    return api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  },

  recallMessage(messageId) {
    return api.patch(`/messages/${messageId}/recall`);
  },

  /** GET /messages?receiverId=&search=1&q= — trang đầu không gửi page; older dùng pageToken. */
  searchConversation(peerId, q, opts = {}) {
    const normalized =
      typeof opts === 'number'
        ? { limit: arguments[3] ?? 50, pageToken: arguments[2] || undefined }
        : opts && typeof opts === 'object'
          ? opts
          : {};
    const params = {
      receiverId: peerId,
      q,
      search: 1,
      limit: normalized.limit ?? 50,
    };
    if (normalized.pageToken) {
      params.pageToken = normalized.pageToken;
    }
    return api.get('/messages', { params });
  },

  unwrap,
};

export default dmMessageService;
