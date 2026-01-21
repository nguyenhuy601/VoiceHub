/* ========================================
   CHATSERVICE.JS - CHAT API SERVICE
   Xử lý tất cả API calls liên quan đến chat
   
   Kết nối đến: chat-system-service (qua api-gateway)
   Base URL: /api/chat
   
   Chức năng:
   - Quản lý channels (get, create, update)
   - Quản lý messages (send, edit, delete)
   - Reactions (emoji reactions)
   - Direct messages (DMs)
   - Search messages
   
   Note: Realtime chat dùng Socket.IO (SocketContext)
   Service này chỉ cho REST API (get history, etc.)
======================================== */

// Import api instance
import api from './api';

const chatService = {
  /* ----- GET CHANNELS: Lấy danh sách channels -----
     
     Gọi: GET /chat/channels?organizationId=xxx
     Query params: organizationId
     Return: [{ id, name, description, members, ... }]
     
     Được gọi khi:
     - Vào trang chat
     - Switch organization
     - Refresh channel list */
  getChannels: async (organizationId) => {
    // GET với query param organizationId
    // Return array of channels thuộc organization này
    return await api.get(`/chat/channels?organizationId=${organizationId}`);
  },

  /* ----- GET CHANNEL BY ID: Lấy chi tiết 1 channel -----
     
     Gọi: GET /chat/channels/:channelId
     Return: { id, name, description, members, settings, ... }
     
     Dùng khi:
     - Click vào channel để xem details
     - Load channel info cho header */
  getChannel: async (channelId) => {
    // GET channel by ID
    return await api.get(`/chat/channels/${channelId}`);
  },

  /* ----- CREATE CHANNEL: Tạo channel mới -----
     
     Gọi: POST /chat/channels
     Body: { name, description, organizationId, type, ... }
     Return: { id, name, ... } (new channel)
     
     Được gọi từ: CreateChannelModal */
  createChannel: async (data) => {
    // data: { name, description, organizationId, type }
    // type: 'text' | 'voice' | 'video'
    return await api.post('/chat/channels', data);
  },

  /* ----- GET MESSAGES: Lấy lịch sử tin nhắn -----
     
     Gọi: GET /chat/channels/:channelId/messages
     Query params: page, limit
     Return: { messages: [...], pagination: {...} }
     
     Pagination:
     - page 1: 50 tin nhắn mới nhất
     - page 2: 50 tin nhắn tiếp theo
     - Scroll lên → load more pages
     
     Dùng khi:
     - Vào channel lần đầu
     - Scroll lên để xem tin cũ */
  getMessages: async (channelId, page = 1, limit = 50) => {
    // GET với pagination
    // limit: số messages mỗi page (default 50)
    // page: page number (default 1 = newest)
    return await api.get(`/chat/channels/${channelId}/messages?page=${page}&limit=${limit}`);
  },

  /* ----- SEND MESSAGE: Gửi tin nhắn mới -----
     
     Gọi: POST /chat/channels/:channelId/messages
     Body: { content, attachments }
     Return: { id, content, sender, timestamp, ... }
     
     Flow:
     1. Call API → save to DB
     2. Server emit socket event
     3. All clients trong channel nhận realtime
     
     Note: Realtime dùng Socket, API này để persist */
  sendMessage: async (channelId, content, attachments = []) => {
    // content: text message
    // attachments: array of file URLs/IDs
    return await api.post(`/chat/channels/${channelId}/messages`, {
      content,
      attachments,
    });
  },

  /* ----- EDIT MESSAGE: Sửa tin nhắn -----
     
     Gọi: PUT /chat/messages/:messageId
     Body: { content }
     
     Chỉ edit được:
     - Message của mình
     - Trong vòng 15 phút (tùy config)
     
     Server sẽ thêm flag "edited" */
  editMessage: async (messageId, content) => {
    // Update content của message
    return await api.put(`/chat/messages/${messageId}`, { content });
  },

  /* ----- DELETE MESSAGE: Xóa tin nhắn -----
     
     Gọi: DELETE /chat/messages/:messageId
     
     Chỉ xóa được:
     - Message của mình
     - Hoặc admin/moderator xóa bất kỳ message nào
     
     Soft delete: message vẫn còn DB, chỉ hide UI */
  deleteMessage: async (messageId) => {
    return await api.delete(`/chat/messages/${messageId}`);
  },

  /* ----- REACT TO MESSAGE: Thêm emoji reaction -----
     
     Gọi: POST /chat/messages/:messageId/reactions
     Body: { emoji }
     Return: { messageId, reactions: [...] }
     
     Toggle behavior:
     - Chưa react → add reaction
     - Đã react cùng emoji → remove
     - Đã react emoji khác → change
     
     Dùng cho: 👍 ❤️ 😂 😮 😢 */
  reactToMessage: async (messageId, emoji) => {
    // emoji: '👍', '❤️', etc.
    return await api.post(`/chat/messages/${messageId}/reactions`, { emoji });
  },

  /* ----- GET DIRECT MESSAGES: Lấy danh sách DMs -----
     
     Gọi: GET /chat/direct
     Return: [{ id, user: {...}, lastMessage: {...}, unread: 0 }]
     
     DM = Direct Message = Chat 1-1
     Khác với channel (nhóm chat)
     
     Được gọi khi:
     - Vào tab Direct Messages
     - Refresh DM list */
  getDirectMessages: async () => {
    // GET list of all DM conversations
    // Mỗi DM có: user info, last message, unread count
    return await api.get('/chat/direct');
  },

  /* ----- CREATE DIRECT MESSAGE: Tạo DM mới -----
     
     Gọi: POST /chat/direct
     Body: { userId }
     Return: { id, users: [...], messages: [] }
     
     Flow:
     1. Click "Message" trên profile
     2. Check xem đã có DM với user này chưa
     3. Nếu chưa → create mới
     4. Nếu có rồi → return existing DM
     5. Redirect to DM chat */
  createDirectMessage: async (userId) => {
    // userId: ID của user muốn chat
    // Server tìm hoặc tạo DM conversation
    return await api.post('/chat/direct', { userId });
  },

  /* ----- SEARCH MESSAGES: Tìm kiếm tin nhắn -----
     
     Gọi: GET /chat/search
     Query params: q (query), channelId
     Return: [{ id, content, sender, timestamp, channelId }]
     
     Search trong:
     - 1 channel cụ thể (nếu có channelId)
     - Tất cả channels (nếu không có channelId)
     
     Dùng khi:
     - User dùng search box
     - Ctrl+F trong chat
     - Tìm tin nhắn cũ */
  searchMessages: async (query, channelId) => {
    // query: text cần tìm
    // channelId: optional - search trong channel cụ thể
    return await api.get(`/chat/search?q=${query}&channelId=${channelId}`);
  },
};

// Export chatService
export default chatService;

/* ========================================
   CÁCH DÙNG TRONG CHATPAGE:
   
   // Load messages khi vào channel
   const messages = await chatService.getMessages(channelId);
   
   // Send message qua Socket (realtime)
   socket.emit('message:send', { channelId, content });
   
   // Nhưng cũng call API để persist
   await chatService.sendMessage(channelId, content);
   
   // Listen realtime messages
   socket.on('message:received', (message) => {
     setMessages(prev => [...prev, message]);
   });
   
   REALTIME vs API:
   - Socket: realtime updates, instant
   - API: persist to DB, load history, search
   - Dùng cả 2 cùng nhau!
======================================== */
