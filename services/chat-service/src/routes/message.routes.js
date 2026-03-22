const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('/shared/middleware/auth');

// Tất cả routes đều cần authentication
router.use(authenticate);

// Tạo tin nhắn mới
router.post('/', messageController.createMessage.bind(messageController));

// Lấy tin nhắn theo ID
router.get('/:messageId', messageController.getMessageById.bind(messageController));

// Lấy danh sách tin nhắn
router.get('/', messageController.getMessages.bind(messageController));

// Đánh dấu tin nhắn đã đọc
router.patch('/:messageId/read', messageController.markAsRead.bind(messageController));

// Xóa tin nhắn (soft delete)
router.delete('/:messageId', messageController.deleteMessage.bind(messageController));

// Thu hồi tin nhắn (recall)
router.patch('/:messageId/recall', messageController.recallMessage.bind(messageController));

// Chỉnh sửa tin nhắn
router.patch('/:messageId/edit', messageController.editMessage.bind(messageController));

// Alias tương thích: một số client cũ gọi PATCH /messages/:id
router.patch('/:messageId', messageController.editMessage.bind(messageController));

module.exports = router;

